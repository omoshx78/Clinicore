import { Router } from "express";
import { z } from "zod";
import { Department } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue, nextAfterConsultation, nextAfterLab } from "../utils/workflow";
import { CONSULTATION_FEE, LAB_TEST_CATALOG } from "../utils/catalog";
import { logAction } from "../utils/audit";

const router = Router();

/**
 * Confirms the caller currently holds the CLAIMED queue entry for this
 * encounter/department before letting them act on it. This is what stops
 * a doctor from submitting a consultation for a patient someone else has
 * claimed (or nobody has claimed yet).
 */
async function requireClaimedEntry(encounterId: string, department: Department, userId: string) {
  const entry = await prisma.queueEntry.findFirst({
    where: { encounterId, department, status: "CLAIMED", claimedById: userId },
  });
  return entry;
}

// ---------------- Triage ----------------

const triageSchema = z.object({
  bp: z.string().optional(),
  temp: z.number().optional(),
  pulse: z.number().int().optional(),
  spo2: z.number().int().optional(),
  weight: z.number().optional(),
  priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).default("NORMAL"),
  notes: z.string().optional(),
});

router.post("/:id/triage", requireAuth, requireRole("NURSE"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = triageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const entry = await requireClaimedEntry(encounterId, "TRIAGE", req.user!.id);
  if (!entry) {
    return res.status(403).json({ error: "You must claim this patient from the triage queue before recording vitals" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const triage = await tx.triageRecord.create({
      data: { encounterId, ...parsed.data, recordedById: req.user!.id },
    });
    await tx.encounter.update({ where: { id: encounterId }, data: { status: "CONSULTATION" } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    // Urgent/emergency triage priority carries forward so doctors see the sickest patients first.
    await enqueue(tx, encounterId, "CONSULTATION", parsed.data.priority);
    return triage;
  });

  await logAction({ userId: req.user!.id, action: "triage.recorded", entityType: "Encounter", entityId: encounterId });
  res.status(201).json(result);
});

// ---------------- Consultation ----------------

const consultationSchema = z.object({
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  labTestIds: z.array(z.string()).default([]), // keys from LAB_TEST_CATALOG
  prescriptions: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).default([]),
});

router.post("/:id/consultation", requireAuth, requireRole("DOCTOR"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = consultationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { diagnosis, notes, labTestIds, prescriptions } = parsed.data;

  const entry = await requireClaimedEntry(encounterId, "CONSULTATION", req.user!.id);
  if (!entry) {
    return res.status(403).json({ error: "You must claim this patient from the consultation queue first" });
  }

  for (const testId of labTestIds) {
    if (!LAB_TEST_CATALOG[testId]) return res.status(400).json({ error: `Unknown lab test "${testId}"` });
  }
  if (prescriptions.length > 0) {
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: prescriptions.map((p) => p.itemId) } } });
    if (items.length !== prescriptions.length) {
      return res.status(400).json({ error: "One or more prescribed items don't exist in inventory" });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.consultation.create({ data: { encounterId, doctorId: req.user!.id, diagnosis, notes } });
    await tx.billingItem.create({
      data: { encounterId, description: "Consultation fee", amount: CONSULTATION_FEE, category: "Consultation" },
    });
    for (const testId of labTestIds) {
      const t = LAB_TEST_CATALOG[testId];
      await tx.labOrder.create({
        data: { encounterId, testName: t.name, price: t.price, orderedById: req.user!.id },
      });
    }
    for (const rx of prescriptions) {
      await tx.prescription.create({ data: { encounterId, itemId: rx.itemId, quantity: rx.quantity } });
    }

    const nextDept = nextAfterConsultation(labTestIds.length > 0, prescriptions.length > 0);
    await tx.encounter.update({ where: { id: encounterId }, data: { status: nextDept } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, nextDept);
    return { nextDepartment: nextDept };
  });

  await logAction({ userId: req.user!.id, action: "consultation.recorded", entityType: "Encounter", entityId: encounterId });
  res.status(201).json(result);
});

// ---------------- Laboratory ----------------

const labResultsSchema = z.object({
  results: z.array(z.object({ labOrderId: z.string(), result: z.string().min(1) })).min(1),
});

router.post("/:id/lab-results", requireAuth, requireRole("LAB_TECH"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = labResultsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const entry = await requireClaimedEntry(encounterId, "LABORATORY", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the laboratory queue first" });

  const orders = await prisma.labOrder.findMany({ where: { encounterId, status: "PENDING" } });
  const prescriptions = await prisma.prescription.count({ where: { encounterId } });

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      const order = orders.find((o) => o.id === r.labOrderId);
      if (!order) continue;
      await tx.labOrder.update({
        where: { id: order.id },
        data: { status: "COMPLETED", result: r.result, resultedById: req.user!.id, resultedAt: new Date() },
      });
      await tx.billingItem.create({
        data: { encounterId, description: `Lab: ${order.testName}`, amount: order.price, category: "Laboratory" },
      });
    }

    const nextDept = nextAfterLab(prescriptions > 0);
    await tx.encounter.update({ where: { id: encounterId }, data: { status: nextDept } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, nextDept);
  });

  await logAction({ userId: req.user!.id, action: "lab.results_entered", entityType: "Encounter", entityId: encounterId });
  res.json({ ok: true });
});

// ---------------- Pharmacy ----------------

router.post("/:id/dispense", requireAuth, requireRole("PHARMACIST"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;

  const entry = await requireClaimedEntry(encounterId, "PHARMACY", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the pharmacy queue first" });

  const prescriptions = await prisma.prescription.findMany({
    where: { encounterId, dispensed: false },
    include: { item: true },
  });

  for (const rx of prescriptions) {
    if (rx.item.quantity < rx.quantity) {
      return res.status(409).json({ error: `Insufficient stock for ${rx.item.name} (have ${rx.item.quantity}, need ${rx.quantity})` });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const rx of prescriptions) {
      await tx.inventoryItem.update({ where: { id: rx.itemId }, data: { quantity: { decrement: rx.quantity } } });
      await tx.inventoryTransaction.create({
        data: {
          itemId: rx.itemId,
          changeQty: -rx.quantity,
          reason: "Dispensed",
          referenceType: "Prescription",
          referenceId: rx.id,
          createdById: req.user!.id,
        },
      });
      await tx.prescription.update({
        where: { id: rx.id },
        data: { dispensed: true, dispensedAt: new Date(), dispensedById: req.user!.id },
      });
      await tx.billingItem.create({
        data: {
          encounterId,
          description: `Pharmacy: ${rx.item.name} x${rx.quantity}`,
          amount: Number(rx.item.unitPrice) * rx.quantity,
          category: "Pharmacy",
        },
      });
    }
    await tx.encounter.update({ where: { id: encounterId }, data: { status: "CASHIER" } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, "CASHIER");
  });

  await logAction({ userId: req.user!.id, action: "pharmacy.dispensed", entityType: "Encounter", entityId: encounterId });
  res.json({ ok: true, itemsDispensed: prescriptions.length });
});

// ---------------- Cashier ----------------

const paymentSchema = z.object({
  method: z.enum(["CASH", "INSURANCE"]),
  insuranceProvider: z.string().optional(),
  claimNo: z.string().optional(),
});

router.post("/:id/payment", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { method, insuranceProvider, claimNo } = parsed.data;

  const entry = await requireClaimedEntry(encounterId, "CASHIER", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the cashier queue first" });

  const billingItems = await prisma.billingItem.findMany({ where: { encounterId } });
  const total = billingItems.reduce((s, i) => s + Number(i.amount), 0);
  const isInsurance = method === "INSURANCE";

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        encounterId,
        method,
        amount: total,
        insuranceProvider: isInsurance ? insuranceProvider : undefined,
        claimNo: isInsurance ? claimNo : undefined,
        claimStatus: isInsurance ? "SUBMITTED" : undefined,
        claimSubmittedAt: isInsurance ? new Date() : undefined,
        paidAt: isInsurance ? undefined : new Date(),
        recordedById: req.user!.id,
      },
    });
    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: "DISCHARGED", dischargedAt: new Date() },
    });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return p;
  });

  await logAction({
    userId: req.user!.id,
    action: isInsurance ? "payment.claim_submitted" : "payment.cash_received",
    entityType: "Encounter",
    entityId: encounterId,
    details: { amount: total },
  });

  res.status(201).json(payment);
});

// ---------------- Insurance claim status updates ----------------

const claimStatusSchema = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "PAID", "REJECTED"]) });

router.patch("/:id/claim-status", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const parsed = claimStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });

  const payment = await prisma.payment.findUnique({ where: { encounterId: req.params.id } });
  if (!payment) return res.status(404).json({ error: "No payment/claim found for this encounter" });

  const updated = await prisma.payment.update({
    where: { encounterId: req.params.id },
    data: {
      claimStatus: parsed.data.status,
      paidAt: parsed.data.status === "PAID" ? new Date() : null,
    },
  });

  await logAction({
    userId: req.user!.id,
    action: "claim.status_updated",
    entityType: "Payment",
    entityId: payment.id,
    details: { status: parsed.data.status },
  });

  res.json(updated);
});

export default router;

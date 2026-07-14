import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue } from "../utils/workflow";
import { logAction } from "../utils/audit";

const router = Router();

/** GET /wards — occupancy overview */
router.get("/", requireAuth, async (_req, res) => {
  const wards = await prisma.ward.findMany({
    include: { beds: { include: { admissions: { where: { dischargedAt: null }, include: { encounter: { include: { patient: true } } } } } } },
  });
  res.json(wards);
});

const admitSchema = z.object({
  encounterId: z.string(),
  bedId: z.string(),
  admittingDiagnosis: z.string().optional(),
  expectedDischarge: z.string().datetime().optional(),
});

/** POST /admissions — admit a patient to a specific bed */
router.post("/admissions", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const parsed = admitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const bed = await prisma.bed.findUnique({ where: { id: d.bedId } });
  if (!bed) return res.status(404).json({ error: "Bed not found" });
  if (bed.status !== "AVAILABLE") return res.status(409).json({ error: `Bed is currently ${bed.status.toLowerCase()}` });

  const encounter = await prisma.encounter.findUnique({ where: { id: d.encounterId } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  const admission = await prisma.$transaction(async (tx) => {
    const a = await tx.admission.create({
      data: {
        encounterId: d.encounterId,
        bedId: d.bedId,
        admittedById: req.user!.id,
        admittingDiagnosis: d.admittingDiagnosis,
        expectedDischarge: d.expectedDischarge ? new Date(d.expectedDischarge) : undefined,
      },
    });
    await tx.bed.update({ where: { id: d.bedId }, data: { status: "OCCUPIED" } });
    await tx.encounter.update({ where: { id: d.encounterId }, data: { status: "ADMITTED", type: "INPATIENT" } });
    return a;
  });

  await logAction({ userId: req.user!.id, action: "ward.admitted", entityType: "Admission", entityId: admission.id });
  res.status(201).json(admission);
});

const noteSchema = z.object({ note: z.string().min(1) });

/** POST /admissions/:id/notes — nursing/doctor round notes during the stay */
router.post("/admissions/:id/notes", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Note text is required" });

  const admission = await prisma.admission.findUnique({ where: { id: req.params.id } });
  if (!admission) return res.status(404).json({ error: "Admission not found" });

  const note = await prisma.nursingNote.create({
    data: { admissionId: admission.id, note: parsed.data.note, recordedById: req.user!.id },
  });
  res.status(201).json(note);
});

/**
 * POST /admissions/:id/discharge
 * Frees the bed and sends the patient to the Cashier queue for final
 * billing — actual encounter discharge happens once payment is recorded,
 * same as the outpatient flow.
 */
router.post("/admissions/:id/discharge", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const admission = await prisma.admission.findUnique({ where: { id: req.params.id } });
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.dischargedAt) return res.status(400).json({ error: "This admission is already discharged" });

  await prisma.$transaction(async (tx) => {
    await tx.admission.update({ where: { id: admission.id }, data: { dischargedAt: new Date() } });
    await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });
    await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: "CASHIER" } });
    await enqueue(tx, admission.encounterId, "CASHIER");
  });

  await logAction({ userId: req.user!.id, action: "ward.discharged_to_billing", entityType: "Admission", entityId: admission.id });
  res.json({ ok: true });
});

export default router;

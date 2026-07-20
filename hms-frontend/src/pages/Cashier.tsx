import { useState, FormEvent } from "react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { ErrorBanner, money } from "../components/ui";

function CashierForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const items = entry.encounter.billingItems || [];
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const [method, setMethod] = useState<"CASH" | "INSURANCE">(p.insuranceProvider ? "INSURANCE" : "CASH");
  const [provider, setProvider] = useState(p.insuranceProvider || "");
  const [claimNo, setClaimNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/payment`, {
        method,
        insuranceProvider: method === "INSURANCE" ? provider : undefined,
        claimNo: method === "INSURANCE" ? claimNo : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-3">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <ErrorBanner message={error} />
      {(entry.encounter.notes || []).length > 0 && (
        <div className="mb-3 space-y-1">
          {entry.encounter.notes!.map((n) => (
            <p key={n.id} className="text-xs bg-slate-50 rounded-lg px-2.5 py-1.5"><span className="font-medium text-slate-600">{n.department}:</span> {n.note}</p>
          ))}
        </div>
      )}
      <table className="w-full text-sm mb-3">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-1.5">{it.description}</td>
              <td className="py-1.5 text-right">{money(it.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-medium">Total due</td>
            <td className="pt-2 font-semibold text-right">{money(total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex gap-4 mb-3">
        <label className="text-sm flex items-center gap-1.5"><input type="radio" checked={method === "CASH"} onChange={() => setMethod("CASH")} /> Cash</label>
        <label className="text-sm flex items-center gap-1.5"><input type="radio" checked={method === "INSURANCE"} onChange={() => setMethod("INSURANCE")} /> Insurance</label>
      </div>
      {method === "INSURANCE" && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-sm">Insurance provider<input required value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <label className="text-sm">Claim / approval no.<input value={claimNo} onChange={(e) => setClaimNo(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <p className="col-span-2 text-xs text-slate-500 -mt-1">This submits a claim. It won't count as collected until it's marked "Paid" under Reports → Insurance claims.</p>
        </div>
      )}
      <button disabled={submitting} className="bg-teal-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-teal-900 disabled:opacity-50">
        {submitting ? "Saving..." : method === "INSURANCE" ? "Submit claim & discharge patient" : "Confirm payment & discharge"}
      </button>
    </form>
  );
}

export default function Cashier() {
  return (
    <QueueBoard
      department="CASHIER"
      title="Cashier"
      subtitle="Generate invoice and capture payment"
      renderAction={(entry, onDone) => <CashierForm entry={entry} onDone={onDone} />}
    />
  );
}

import { useState, useEffect, FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry, InventoryItem } from "../types";
import { ErrorBanner, money } from "../components/ui";

interface LabTest { id: string; name: string; price: number; }

function ConsultationForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [medicines, setMedicines] = useState<InventoryItem[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedLabIds, setSelectedLabIds] = useState<string[]>([]);
  const [prescriptions, setPrescriptions] = useState<{ itemId: string; name: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [catalog, inventory] = await Promise.all([api.get("/catalog"), api.get("/inventory?category=Medicine")]);
      setLabTests(catalog.labTests);
      setMedicines(inventory);
    })();
  }, []);

  const toggleLab = (id: string) => {
    setSelectedLabIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const addRx = (itemId: string) => {
    if (!itemId || prescriptions.find((r) => r.itemId === itemId)) return;
    const item = medicines.find((m) => m.id === itemId);
    if (!item) return;
    setPrescriptions((rx) => [...rx, { itemId, name: item.name, qty: 1 }]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/consultation`, {
        diagnosis: diagnosis || undefined,
        notes: notes || undefined,
        labTestIds: selectedLabIds,
        prescriptions: prescriptions.map((r) => ({ itemId: r.itemId, quantity: r.qty })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save consultation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-1">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      {entry.encounter.triage && (
        <p className="text-xs text-slate-500 mb-3">
          Vitals: BP {entry.encounter.triage.bp || "—"} · Temp {entry.encounter.triage.temp ?? "—"}°C · Pulse {entry.encounter.triage.pulse ?? "—"} · SpO2 {entry.encounter.triage.spo2 ?? "—"}%
        </p>
      )}
      <ErrorBanner message={error} />
      <label className="text-sm block">Diagnosis
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="text-sm block mt-3">Clinical notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </label>

      <p className="text-sm font-medium mt-4 mb-2">Order lab tests</p>
      <div className="grid grid-cols-2 gap-1.5">
        {labTests.map((t) => (
          <label key={t.id} className="text-xs flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <input type="checkbox" checked={selectedLabIds.includes(t.id)} onChange={() => toggleLab(t.id)} />
            {t.name} <span className="text-slate-400">({money(t.price)})</span>
          </label>
        ))}
      </div>

      <p className="text-sm font-medium mt-4 mb-2">Prescribe medicines</p>
      <select onChange={(e) => { addRx(e.target.value); e.target.value = ""; }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" defaultValue="">
        <option value="" disabled>Add medicine...</option>
        {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.quantity} {m.unit} in stock)</option>)}
      </select>
      {prescriptions.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {prescriptions.map((r) => (
            <li key={r.itemId} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
              <span className="flex-1">{r.name}</span>
              <input
                type="number"
                min={1}
                value={r.qty}
                onChange={(e) => setPrescriptions((rx) => rx.map((x) => (x.itemId === r.itemId ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))}
                className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
              />
              <button type="button" onClick={() => setPrescriptions((rx) => rx.filter((x) => x.itemId !== r.itemId))}>
                <Trash2 size={14} className="text-slate-400 hover:text-rose-600" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button disabled={submitting} className="mt-3 bg-teal-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-teal-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Save consultation"}
      </button>
    </form>
  );
}

export default function Consultation() {
  return (
    <QueueBoard
      department="CONSULTATION"
      title="Consultation"
      subtitle="Doctor's assessment, lab orders and prescriptions"
      renderAction={(entry, onDone) => <ConsultationForm entry={entry} onDone={onDone} />}
    />
  );
}

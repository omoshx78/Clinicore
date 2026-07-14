import { useState, useEffect, FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner, money } from "../components/ui";
import { Patient } from "../types";

interface Equipment { id: string; name: string; type: string; feeItems: { label: string; defaultAmount: string }[]; }
interface FeeItem { label: string; amount: number; }

export default function Theatre() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const [equipmentId, setEquipmentId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [encounterId, setEncounterId] = useState("");
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(60);
  const [purpose, setPurpose] = useState("");
  const [items, setItems] = useState<FeeItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadEquipment = async () => {
    const eq = await api.get("/theatre/equipment");
    setEquipment(eq);
    if (eq.length > 0) {
      setEquipmentId(eq[0].id);
      setItems(eq[0].feeItems.map((fi: any) => ({ label: fi.label, amount: Number(fi.defaultAmount) })));
    }
  };

  const loadBookings = async () => {
    try {
      const b = await api.get(`/theatre/bookings?date=${date}`);
      setBookings(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load bookings");
    }
  };

  useEffect(() => { loadEquipment(); }, []);
  useEffect(() => { loadBookings(); }, [date]);

  const changeEquipment = (id: string) => {
    setEquipmentId(id);
    const eq = equipment.find((e) => e.id === id);
    setItems(eq ? eq.feeItems.map((fi) => ({ label: fi.label, amount: Number(fi.defaultAmount) })) : []);
  };

  const searchPatients = async () => {
    if (!patientSearch) return;
    const results = await api.get(`/patients?search=${encodeURIComponent(patientSearch)}`);
    setPatientResults(results);
  };

  const pickPatient = async (p: Patient) => {
    setSelectedPatient(p);
    setPatientResults([]);
    const full = await api.get(`/patients/${p.id}`);
    const active = (full.encounters || []).find((e: any) => e.status !== "DISCHARGED");
    setEncounterId(active ? active.id : "");
  };

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/theatre/bookings", {
        equipmentId,
        encounterId: encounterId || undefined,
        date: new Date(date).toISOString(),
        time,
        durationMin,
        purpose: purpose || undefined,
        items,
      });
      setPurpose("");
      setSelectedPatient(null);
      setEncounterId("");
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const claim = async (id: string) => {
    try {
      await api.post(`/theatre/bookings/${id}/claim`);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not claim this case");
    }
  };
  const complete = async (id: string) => {
    try {
      await api.post(`/theatre/bookings/${id}/complete`);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete this case");
    }
  };
  const cancel = async (id: string) => {
    await api.post(`/theatre/bookings/${id}/cancel`);
    await loadBookings();
  };

  return (
    <div>
      <SectionHeader title="Theatre & equipment" subtitle="Book operating theatres, imaging machines and diagnostic equipment" />
      <ErrorBanner message={error} />
      <div className="grid grid-cols-3 gap-5 mb-5">
        <Card>
          <p className="font-medium text-sm mb-3">New booking</p>
          <form onSubmit={submit} className="space-y-2.5">
            <label className="text-sm block">Equipment / theatre
              <select value={equipmentId} onChange={(e) => changeEquipment(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
              </select>
            </label>

            <label className="text-sm block">Patient (optional — leave blank for unassigned block)</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span>{selectedPatient.firstName} {selectedPatient.lastName} ({selectedPatient.mrn})</span>
                <button type="button" onClick={() => { setSelectedPatient(null); setEncounterId(""); }} className="text-xs text-slate-400 hover:text-rose-600">Clear</button>
              </div>
            ) : (
              <div>
                <div className="flex gap-1.5">
                  <input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchPatients())} placeholder="Search patient..." className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  <button type="button" onClick={searchPatients} className="text-xs bg-slate-800 text-white rounded-lg px-3 hover:bg-slate-900">Search</button>
                </div>
                {patientResults.length > 0 && (
                  <ul className="mt-1.5 space-y-1 max-h-32 overflow-auto">
                    {patientResults.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => pickPatient(p)} className="w-full text-left text-xs px-2 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
                          {p.firstName} {p.lastName} ({p.mrn})
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {selectedPatient && !encounterId && (
              <p className="text-xs text-amber-700">This patient has no active visit — the booking will be saved without a charge/queue link.</p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-sm block">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="text-sm block">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            </div>
            <label className="text-sm block">Duration (min)<input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm block">Purpose<input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Appendectomy, chest X-ray" /></label>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Itemized fees</p>
                <button type="button" onClick={() => setItems((it) => [...it, { label: "Additional fee", amount: 0 }])} className="text-xs text-teal-700 hover:underline inline-flex items-center gap-0.5"><Plus size={12} /> Line item</button>
              </div>
              <div className="space-y-1.5 mt-1.5">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input value={it.label} onChange={(e) => setItems((all) => all.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <input type="number" value={it.amount} onChange={(e) => setItems((all) => all.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <button type="button" onClick={() => setItems((all) => all.filter((_, i) => i !== idx))}><Trash2 size={14} className="text-slate-400 hover:text-rose-600" /></button>
                  </div>
                ))}
              </div>
            </div>
            {encounterId && <p className="text-xs text-slate-500">Total {money(total)} will be added to this patient's bill when the case is completed.</p>}
            <button disabled={submitting} className="w-full bg-teal-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-teal-900 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><Plus size={15} /> Add booking</button>
          </form>
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">Schedule</p>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-xs" />
          </div>
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-400">No bookings for this date.</p>
          ) : (
            <ul className="space-y-2 max-h-[500px] overflow-auto">
              {bookings.map((b) => (
                <li key={b.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{b.equipment.name} · {b.time}</p>
                      <p className="text-xs text-slate-500">{b.encounter?.patient ? `${b.encounter.patient.firstName} ${b.encounter.patient.lastName} (${b.encounter.patient.mrn})` : "Unassigned"} — {b.purpose || "No purpose noted"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{money(b.charges.reduce((s: number, c: any) => s + Number(c.amount), 0))} · {b.charges.length} item(s)</p>
                    </div>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-300">{b.status}</Badge>
                  </div>
                  {b.encounterId && b.status !== "Completed" && b.status !== "Cancelled" && (
                    <div className="flex gap-3 mt-2">
                      {b.status === "Scheduled" && <button onClick={() => claim(b.id)} className="text-xs bg-teal-800 text-white rounded-lg py-1 px-3 hover:bg-teal-900">Claim & start</button>}
                      {b.status === "In progress" && <button onClick={() => complete(b.id)} className="text-xs bg-emerald-700 text-white rounded-lg py-1 px-3 hover:bg-emerald-800">Complete & bill</button>}
                      <button onClick={() => cancel(b.id)} className="text-xs text-slate-400 hover:text-rose-600">Cancel</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

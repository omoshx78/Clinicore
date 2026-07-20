import { useState, useEffect } from "react";
import { Search, Users, Clock } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner, money } from "../components/ui";
import { Patient } from "../types";

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: "bg-slate-100 text-slate-700 border-slate-300",
  TRIAGE: "bg-amber-100 text-amber-800 border-amber-300",
  CONSULTATION: "bg-teal-100 text-teal-800 border-teal-300",
  LABORATORY: "bg-purple-100 text-purple-800 border-purple-300",
  PHARMACY: "bg-sky-100 text-sky-800 border-sky-300",
  CASHIER: "bg-orange-100 text-orange-800 border-orange-300",
  AWAITING_ADMISSION: "bg-indigo-100 text-indigo-800 border-indigo-300",
  AWAITING_THEATRE: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
  ADMITTED: "bg-indigo-100 text-indigo-800 border-indigo-300",
  DISCHARGED: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export default function Patients() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        // Empty search still hits the API — the backend returns the most
        // recently registered patients when no search term is given, so
        // the list below is never empty by default.
        setResults(await api.get(`/patients?search=${encodeURIComponent(search.trim())}`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load patients");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const select = async (p: Patient) => {
    try {
      setSelected(await api.get(`/patients/${p.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load patient");
    }
  };

  return (
    <div>
      <SectionHeader title="Patients" subtitle="Search patients and review their full visit history" />
      <ErrorBanner message={error} />
      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-1">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, MRN, phone, or ID number"
              className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-slate-400 mb-2">{search.trim() ? "Search results" : "Recent patients"}</p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400">No patients found.</p>
          ) : (
            <ul className="space-y-2 max-h-[520px] overflow-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button onClick={() => select(p)} className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${selected?.id === p.id ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <p className="font-medium">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-slate-500">{p.mrn} · {p.phone || "no phone"}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed border-slate-300 rounded-xl">
              <Users size={28} className="mb-2" />
              <p className="text-sm">Select a patient to view their visit history.</p>
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <p className="font-medium">{selected.firstName} {selected.lastName} <span className="text-slate-400 font-normal text-sm">({selected.mrn})</span></p>
                <p className="text-xs text-slate-500">{selected.gender} · {selected.phone || "no phone"} · {selected.insuranceProvider ? `Insured — ${selected.insuranceProvider}` : "No insurance on file"}</p>
              </div>
              <div className="space-y-4">
                {(selected.encounters || []).map((enc: any) => (
                  <div key={enc.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">{enc.type} visit — {new Date(enc.registeredAt).toLocaleDateString()}</p>
                      <Badge className={STATUS_COLORS[enc.status] || "bg-slate-100 text-slate-700 border-slate-300"}>{enc.status}</Badge>
                    </div>
                    {enc.chiefComplaint && <p className="text-xs text-slate-500 mb-1">Complaint: {enc.chiefComplaint}</p>}
                    {enc.triage?.notes && <p className="text-xs text-slate-500 mb-1"><span className="font-medium">Triage:</span> {enc.triage.notes}</p>}
                    {(enc.consultations || []).map((c: any) => (
                      (c.diagnosis || c.notes) && (
                        <p key={c.id} className="text-xs text-slate-500 mb-1"><span className="font-medium">Doctor:</span> {c.diagnosis ? `${c.diagnosis} — ` : ""}{c.notes || ""}</p>
                      )
                    ))}
                    {(enc.notes || []).length > 0 && (
                      <div className="mt-1.5 mb-1 space-y-1">
                        {enc.notes.map((n: any) => (
                          <p key={n.id} className="text-xs bg-slate-50 rounded px-2 py-1"><span className="font-medium text-slate-600">{n.department}:</span> {n.note}</p>
                        ))}
                      </div>
                    )}
                    {enc.billingItems?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><Clock size={11} /> Billing</p>
                        <table className="w-full text-xs">
                          <tbody>
                            {enc.billingItems.map((it: any) => (
                              <tr key={it.id} className="border-b border-slate-100">
                                <td className="py-1">{it.description}</td>
                                <td className="py-1 text-right">{money(it.amount)}</td>
                              </tr>
                            ))}
                            <tr>
                              <td className="pt-1 font-medium">Total</td>
                              <td className="pt-1 font-semibold text-right">{money(enc.billingItems.reduce((s: number, i: any) => s + Number(i.amount), 0))}</td>
                            </tr>
                          </tbody>
                        </table>
                        {enc.payment && (
                          <p className="text-xs text-slate-500 mt-1">
                            {enc.payment.method === "CASH"
                              ? "Paid in cash"
                              : `Insurance claim: ${enc.payment.claimStatus} (${enc.payment.insuranceProvider || "—"})`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {(!selected.encounters || selected.encounters.length === 0) && (
                  <p className="text-sm text-slate-400">No visits recorded yet.</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

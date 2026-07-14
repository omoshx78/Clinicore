import { useState, FormEvent } from "react";
import { Search, UserPlus } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, ErrorBanner } from "../components/ui";
import { Patient } from "../types";

const emptyForm = {
  firstName: "",
  lastName: "",
  gender: "FEMALE",
  phone: "",
  nationalId: "",
  isInsured: false,
  insuranceProvider: "",
  insuranceNo: "",
  chiefComplaint: "",
  type: "OUTPATIENT",
};

export default function Reception() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await api.post("/patients/register", {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        phone: form.phone || undefined,
        nationalId: form.nationalId || undefined,
        insuranceProvider: form.isInsured ? form.insuranceProvider : undefined,
        insuranceNo: form.isInsured ? form.insuranceNo : undefined,
        chiefComplaint: form.chiefComplaint || undefined,
        type: form.type,
      });
      setSuccess(`${res.patient.firstName} ${res.patient.lastName} registered — ${res.patient.mrn}. Sent to triage.`);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register patient");
    } finally {
      setSubmitting(false);
    }
  };

  const runSearch = async () => {
    setSearching(true);
    try {
      const res = await api.get(`/patients?search=${encodeURIComponent(search)}`);
      setResults(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const startVisit = async (patientId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/patients/${patientId}/visit`, { chiefComplaint: form.chiefComplaint || undefined, type: form.type });
      setSuccess("New visit started. Patient sent to triage.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start visit");
    }
  };

  return (
    <div>
      <SectionHeader title="Reception" subtitle="Register a new patient or start a visit for a returning patient" />
      <ErrorBanner message={error} />
      {success && <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{success}</div>}

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><UserPlus size={15} /> New patient</p>
          <form onSubmit={submitNew} className="grid grid-cols-2 gap-3">
            <label className="text-sm">First name
              <input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">Last name
              <input required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">Gender
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-sm">Phone
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm col-span-2">National ID (optional)
              <input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-sm col-span-2">Visit type
              <select value={form.type} onChange={(e) => set("type", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="OUTPATIENT">Outpatient</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </label>
            <label className="text-sm col-span-2">Chief complaint
              <input value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Reason for visit" />
            </label>
            <label className="text-sm col-span-2 flex items-center gap-2 mt-1">
              <input type="checkbox" checked={form.isInsured} onChange={(e) => set("isInsured", e.target.checked)} />
              Patient has insurance cover
            </label>
            {form.isInsured && (
              <>
                <label className="text-sm">Insurance provider
                  <input value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="text-sm">Policy / member no.
                  <input value={form.insuranceNo} onChange={(e) => set("insuranceNo", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </label>
              </>
            )}
            <button disabled={submitting} className="col-span-2 mt-2 bg-teal-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-teal-900 disabled:opacity-50">
              {submitting ? "Registering..." : "Register & send to triage"}
            </button>
          </form>
        </Card>

        <Card>
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><Search size={15} /> Returning patient</p>
          <div className="flex gap-2 mb-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search by name, MRN, or phone"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={runSearch} disabled={searching} className="bg-slate-800 text-white rounded-lg px-4 text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
              Search
            </button>
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-slate-400">Search to find a returning patient and start a new visit for them.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-auto">
              {results.map((p) => (
                <li key={p.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-slate-500">{p.mrn} · {p.phone || "no phone"}</p>
                  </div>
                  <button onClick={() => startVisit(p.id)} className="text-xs bg-teal-800 text-white rounded-lg py-1.5 px-3 font-medium hover:bg-teal-900">
                    Start visit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

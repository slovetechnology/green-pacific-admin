import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";

// NIID check on a motor policy (backend compliance/rules/niidChecks.js): staff look the certificate up on the Nigerian
// Insurance Industry Database and record what they found. The latest check is the policy's NIID status; the
// NIID_VERIFIED compliance rule flags a motor policy without a verified one.

interface NiidCheck {
  id: number;
  result: "Verified" | "Not found" | "Mismatch";
  registration_no: string | null;
  niid_reference: string | null;
  checked_on: string;
  notes: string | null;
  checked_by: string | null;
}

interface NiidState {
  applies: boolean;
  registrationNo: string | null;
  latest: NiidCheck | null;
  checks: NiidCheck[];
  website: string;
}

const RESULTS: NiidCheck["result"][] = ["Verified", "Not found", "Mismatch"];
const badge = (r: NiidCheck["result"]) => (r === "Verified" ? "badge badge-paid" : "badge badge-unpaid");
const today = () => new Date().toISOString().slice(0, 10);

export function NiidCheckPanel({ txId }: { txId: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["transactions", txId, "niid-checks"];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<NiidState>(`/api/transactions/${txId}/niid-checks`) });
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<NiidCheck["result"]>("Verified");
  const [registration, setRegistration] = useState("");
  const [reference, setReference] = useState("");
  const [checkedOn, setCheckedOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data?.applies) return null;
  const latest = data.latest;
  const stale = latest?.result === "Verified" && data.registrationNo && latest.registration_no
    && latest.registration_no.replace(/[^A-Z0-9]/gi, "").toUpperCase() !== data.registrationNo.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  function start() {
    setRegistration(data?.registrationNo ?? "");
    setReference("");
    setCheckedOn(today());
    setNotes("");
    setResult("Verified");
    setError(null);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/transactions/${txId}/niid-checks`, { result, registration_no: registration, niid_reference: reference, checked_on: checkedOn, notes });
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ["transactions", String(txId)] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the check.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>NIID check</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a className="btn btn-secondary btn-sm" href={data.website} target="_blank" rel="noopener noreferrer">Open NIID</a>
          {user?.canWrite && !open && <button type="button" className="btn btn-sm" onClick={start}>Record a check</button>}
        </div>
      </div>
      <p style={{ marginBottom: 0 }}>
        {latest ? (
          <>
            <span className={badge(latest.result)}>{latest.result}</span>{" "}
            {latest.registration_no ?? "—"} on {latest.checked_on}
            {latest.niid_reference ? `, NIID ref. ${latest.niid_reference}` : ""}
            {latest.checked_by ? ` (${latest.checked_by})` : ""}
            {latest.notes ? `: ${latest.notes}` : ""}
          </>
        ) : (
          <><span className="badge badge-secondary">Not checked</span> Confirm this vehicle's certificate is on the Nigerian Insurance Industry Database.</>
        )}
      </p>
      {stale && (
        <div className="flash flash-error" style={{ marginTop: "0.75rem" }}>
          The check was for {latest!.registration_no}, but the policy now covers {data.registrationNo}. Check the new vehicle.
        </div>
      )}

      {open && (
        <form onSubmit={save} noValidate style={{ marginTop: "1rem" }}>
          {error && <div className="flash flash-error">{error}</div>}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="niid_result">Result</label>
              <select id="niid_result" value={result} onChange={(e) => setResult(e.target.value as NiidCheck["result"])}>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="niid_reg">Registration number checked</label>
              <input id="niid_reg" value={registration} maxLength={64} onChange={(e) => setRegistration(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="niid_ref">NIID reference / certificate no. (optional)</label>
              <input id="niid_ref" value={reference} maxLength={255} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="niid_date">Checked on</label>
              <input id="niid_date" type="date" value={checkedOn} max={today()} onChange={(e) => setCheckedOn(e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="niid_notes">{result === "Verified" ? "Note (optional)" : "What NIID showed (required)"}</label>
              <textarea id="niid_notes" rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Save check"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {data.checks.length > 1 && (
        <details style={{ marginTop: "0.75rem" }}>
          <summary>Earlier checks ({data.checks.length - 1})</summary>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {data.checks.slice(1).map((c) => (
              <li key={c.id}>{c.checked_on}: {c.result}, {c.registration_no ?? "—"}{c.checked_by ? ` (${c.checked_by})` : ""}{c.notes ? `: ${c.notes}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

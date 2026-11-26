import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { FLAG_STATUS_BADGE, SEVERITY_BADGE, type AppraisalMeta, type ConductFlag } from "../lib/appraisalTypes";

const EMPTY = { employee_id: "", cycle_id: "", severity: "", category: "", description: "", evidence: "" };

// HR, Compliance and the MD raise and decide conduct flags. Only a
// Confirmed flag affects a score; the employee can respond before that.
export function ConductFlagsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("Raised");
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", "flags", statusFilter],
    queryFn: () => api.get<{ flags: ConductFlag[] }>(`/api/appraisal/conduct-flags?status=${encodeURIComponent(statusFilter)}`),
  });
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const m = meta.data;

  async function refresh(text: string) {
    setMessage({ kind: "success", text });
    await queryClient.invalidateQueries({ queryKey: ["appraisal"] });
  }

  async function raise(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post("/api/appraisal/conduct-flags", form);
      setForm(EMPTY);
      await refresh("Flag raised. The employee can now see it and respond.");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not raise the flag." });
    }
  }

  async function scan() {
    setMessage(null);
    try {
      const r = await api.post<{ suggested: number }>("/api/appraisal/conduct-flags/scan");
      setStatusFilter("Suggested");
      await refresh(r.suggested ? `${r.suggested} new suggestion(s) from ERP signals.` : "No new signals.");
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not check ERP signals." });
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Conduct flags</h1>
        <div className="page-header-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={scan}>Check ERP signals now</button>
        </div>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h2>Raise a flag</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Critical caps the final score at 1, Major at 2 and Moderate at 3. Major and Critical also remove the bonus.
          Each Minor flag takes 0.5 off the conduct score.
        </p>
        <form onSubmit={raise}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="flag-employee">Employee</label>
              <select id="flag-employee" value={form.employee_id} onChange={set("employee_id")} required>
                <option value="">Choose…</option>
                {m?.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.staff_no})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="flag-cycle">Cycle</label>
              <select id="flag-cycle" value={form.cycle_id} onChange={set("cycle_id")} required>
                <option value="">Choose…</option>
                {m?.cycles.filter((c) => c.status !== "Closed").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="flag-severity">Severity</label>
              <select id="flag-severity" value={form.severity} onChange={set("severity")} required>
                <option value="">Choose…</option>
                {m?.flagSeverities.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="flag-category">Category</label>
              <select id="flag-category" value={form.category} onChange={set("category")} required>
                <option value="">Choose…</option>
                {m?.flagCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="flag-description">What happened</label>
            <textarea id="flag-description" rows={3} value={form.description} onChange={set("description")} required />
          </div>
          <div className="field">
            <label htmlFor="flag-evidence">Evidence (record numbers, dates, documents)</label>
            <textarea id="flag-evidence" rows={2} value={form.evidence} onChange={set("evidence")} required />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn">Raise flag</button>
          </div>
        </form>
      </div>

      <div className="toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
          <option value="Suggested">Suggested by the ERP</option>
          <option value="Raised">Awaiting decision</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Dismissed">Dismissed</option>
          <option value="">All</option>
        </select>
      </div>

      {isLoading ? (
        <div className="card">Loading…</div>
      ) : !data?.flags.length ? (
        <div className="card">No flags here.</div>
      ) : (
        data.flags.map((f) => <FlagCard key={f.id} flag={f} onDecided={refresh} onError={(text) => setMessage({ kind: "error", text })} />)
      )}
    </div>
  );
}

function FlagCard({ flag: f, onDecided, onError }: { flag: ConductFlag; onDecided: (text: string) => void; onError: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState(f.severity);
  async function decide(decision: "Confirmed" | "Dismissed") {
    try {
      await api.post(`/api/appraisal/conduct-flags/${f.id}/decide`, { decision, note });
      onDecided(`Flag ${decision.toLowerCase()}.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not record the decision.");
    }
  }
  async function triage(decision: "Raise" | "Dismiss") {
    try {
      await api.post(`/api/appraisal/conduct-flags/${f.id}/triage`, { decision, note, severity });
      onDecided(decision === "Raise" ? "Flag raised. The employee can now see it and respond." : "Suggestion dismissed.");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not record the decision.");
    }
  }
  if (f.status === "Suggested") {
    return (
      <div className="card">
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className={`badge ${FLAG_STATUS_BADGE[f.status]}`}>Suggested by the ERP</span>
          <strong>{f.full_name}</strong> ({f.staff_no}) · {f.category} · {f.cycle_name}
        </div>
        <p>{f.description}</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Evidence: {f.evidence}. The employee can't see this until it is raised.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`sev-${f.id}`}>Severity if raised</label>
            <select id={`sev-${f.id}`} value={severity} onChange={(e) => setSeverity(e.target.value as ConductFlag["severity"])}>
              {["Critical", "Major", "Moderate", "Minor"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor={`triage-note-${f.id}`}>Why it doesn't stand (to dismiss)</label>
            <input id={`triage-note-${f.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => triage("Raise")}>Raise flag</button>
          <button type="button" className="btn-secondary btn" onClick={() => triage("Dismiss")}>Dismiss</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <span className={`badge ${SEVERITY_BADGE[f.severity]}`}>{f.severity}</span>
        <span className={`badge ${FLAG_STATUS_BADGE[f.status]}`}>{f.status}</span>
        <strong>{f.full_name}</strong> ({f.staff_no}) · {f.category} · {f.cycle_name}
      </div>
      <p>{f.description}</p>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Evidence: {f.evidence} · raised by {f.raised_by} on {f.raised_at.slice(0, 10)}</p>
      <p>
        <strong>Employee's response:</strong> {f.employee_response || <span style={{ color: "var(--text-muted)" }}>None yet</span>}
      </p>
      {f.decision_note && <p><strong>Decision by {f.decided_by}:</strong> {f.decision_note}</p>}
      {f.status === "Raised" && (
        <>
          <div className="field">
            <label htmlFor={`decision-note-${f.id}`}>Reason for the decision</label>
            <textarea id={`decision-note-${f.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => decide("Confirmed")}>Confirm</button>
            <button type="button" className="btn-secondary btn" onClick={() => decide("Dismissed")}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}

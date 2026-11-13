import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { DataGrid } from "@/shared/components/DataGrid";

interface Settings {
  enabled: boolean;
  counselConfirmedOn: string | null;
  counselNote: string | null;
  rules: { record: string; rule: string }[];
}

interface Item {
  id: number;
  month: string;
  record_type: "employee" | "feedback";
  label: string;
  reference_date: string;
  rule: string;
  reviewer_role: "retention_reviewer" | "hr";
  decision: "Pending" | "Approved" | "Held";
  hold_reason: string | null;
  decided_by: string | null;
}

const DECISION_BADGE: Record<string, string> = { Pending: "badge-pending", Approved: "badge-paid", Held: "badge-warning" };

// Month-end retention review (decided 26 Sep 2026): the Team Lead, Audit &
// Internal Control approves or holds each record before it is anonymised;
// records about the reviewer or the Head of Audit & Internal Control go to
// the Head of HR. The job stays off until counsel's confirmation is recorded.
export function RetentionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["appraisal", "retention"],
    queryFn: () => api.get<{ items: Item[]; canDecide: string[]; settings: Settings }>("/api/appraisal/retention"),
    retry: false,
  });
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [counsel, setCounsel] = useState({ counsel_confirmed_on: "", counsel_note: "" });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, text: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "success", text });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "retention"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }

  if (isLoading) return <div className="card">Loading…</div>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the retention review."}</div>;
  const s = data.settings;
  const decide = (item: Item, decision: "Approve" | "Hold") =>
    run(
      () => api.post(`/api/appraisal/retention/items/${item.id}/decide`, { decision, reason: reasons[item.id] || "" }),
      decision === "Approve" ? "Approved and carried out." : "Held until next month."
    );

  return (
    <div>
      <div className="page-header">
        <h1>Retention review</h1>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="card">
        <h2>Rules</h2>
        <ul>
          {s.rules.map((r) => (
            <li key={r.record}>
              <strong>{r.record}:</strong> {r.rule}
            </li>
          ))}
        </ul>
        <p>
          Status:{" "}
          {s.enabled ? (
            <span className="badge badge-paid">On</span>
          ) : (
            <span className="badge badge-draft">Off</span>
          )}{" "}
          {s.counselConfirmedOn ? `Counsel confirmed the periods on ${s.counselConfirmedOn}: ${s.counselNote}` : "Counsel hasn't confirmed the periods yet."}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Anonymising replaces names and all written comments; scores stay so trends remain valid. The audit log is never changed.
        </p>
        {user?.isAdmin && (
          <>
            {!s.enabled ? (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="counsel-date">Date counsel confirmed</label>
                  <input id="counsel-date" type="date" value={counsel.counsel_confirmed_on} onChange={(e) => setCounsel({ ...counsel, counsel_confirmed_on: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "span 2" }}>
                  <label htmlFor="counsel-note">What was confirmed</label>
                  <input id="counsel-note" value={counsel.counsel_note} onChange={(e) => setCounsel({ ...counsel, counsel_note: e.target.value })} />
                </div>
              </div>
            ) : null}
            <div className="form-actions">
              {s.enabled ? (
                <>
                  <button type="button" className="btn-secondary btn" onClick={() => run(() => api.put("/api/appraisal/retention/settings", { enabled: false }), "Switched off.")}>
                    Switch off
                  </button>
                  <button type="button" className="btn-secondary btn" onClick={() => run(() => api.post("/api/appraisal/retention/build"), "This month's list is built.")}>
                    Build this month's list now
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => run(() => api.put("/api/appraisal/retention/settings", { enabled: true, ...counsel }), "Switched on.")}>
                  Switch on
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <DataGrid
        columns={[
          { key: "m", header: "Month", render: (i) => i.month },
          { key: "l", header: "Record", render: (i) => i.label },
          { key: "t", header: "Type", render: (i) => (i.record_type === "employee" ? "Leaver's appraisal records" : "Raw 360° answers") },
          { key: "d", header: "Reference date", render: (i) => i.reference_date },
          { key: "r", header: "Rule", render: (i) => i.rule },
          {
            key: "decision",
            header: "Decision",
            render: (i) =>
              i.decision === "Approved" || !data.canDecide.includes(i.reviewer_role) ? (
                <>
                  <span className={`badge ${DECISION_BADGE[i.decision]}`}>{i.decision}</span>
                  {i.hold_reason && <div style={{ fontSize: "0.8rem" }}>{i.hold_reason}</div>}
                </>
              ) : (
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  {i.decision === "Held" && <span style={{ fontSize: "0.8rem" }}>Held: {i.hold_reason}</span>}
                  <input aria-label={`Reason to hold ${i.label}`} placeholder="Reason to hold" value={reasons[i.id] || ""} onChange={(e) => setReasons((r) => ({ ...r, [i.id]: e.target.value }))} />
                  <span style={{ display: "flex", gap: "0.3rem" }}>
                    <button type="button" className="btn btn-sm" onClick={() => decide(i, "Approve")}>Approve</button>
                    <button type="button" className="btn-secondary btn btn-sm" onClick={() => decide(i, "Hold")}>Hold</button>
                  </span>
                </div>
              ),
          },
        ]}
        rows={data.items}
        isLoading={false}
        getRowKey={(i) => i.id}
        emptyMessage={s.enabled ? "Nothing to review. The list is built on the last working day of each month." : "The retention job is off."}
      />
    </div>
  );
}

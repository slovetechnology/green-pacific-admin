import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { Modal } from "@/shared/components/exec/Modal";
import "@/shared/styles/pipeline.css";

// Compliance > Data protection (Nigeria Data Protection Act 2023; backend compliance/privacy). Admins and compliance
// officers only. Three registers: data subject requests (due in 30 days), personal data breaches (the NDPC to be told
// within 72 hours) and the retention review (clients 6 years past the end of the relationship; nothing is anonymised
// without a decision here).

interface Request { id: number; reference_no: string; client_id: number | null; client_name: string | null; requester_name: string; requester_contact: string | null; request_type: string; details: string | null; received_on: string; due_on: string; status: string; outcome: string | null; overdue: boolean; days_left: number | null }
interface Breach { id: number; reference_no: string; aware_at: string; description: string; data_affected: string | null; subjects_affected: number | null; risk: string; ndpc_notified_on: string | null; subjects_notified_on: string | null; not_notified_reason: string | null; actions: string | null; status: string; ndpc_deadline: string; ndpc_overdue: boolean }
interface Retention { id: number; client_id: number; client_name: string | null; relationship_ended_on: string; due_on: string; status: string; note: string | null; hold_until: string | null; decided_by: string | null }
interface Overview { requests: Request[]; breaches: Breach[]; retention: Retention[]; requestTypes: string[] }

const today = () => new Date().toISOString().slice(0, 10);
type Dialog =
  | { kind: "request" } | { kind: "close-request"; request: Request } | { kind: "breach" } | { kind: "update-breach"; breach: Breach }
  | { kind: "retention"; item: Retention };

export function DataProtectionPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["data-protection"], queryFn: () => api.get<Overview>("/api/data-protection"), retry: false });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [notice, setNotice] = useState<string | null>(null);
  const done = (text: string) => { setDialog(null); setNotice(text); void queryClient.invalidateQueries({ queryKey: ["data-protection"] }); };

  const save = useMutation({
    mutationFn: async () => {
      const d = dialog!;
      if (d.kind === "request") return api.post("/api/data-protection/requests", form);
      if (d.kind === "close-request") return api.post(`/api/data-protection/requests/${d.request.id}/close`, form);
      if (d.kind === "breach") return api.post("/api/data-protection/breaches", form);
      if (d.kind === "update-breach") return api.post(`/api/data-protection/breaches/${d.breach.id}`, { ...form, close: form.close === "1" });
      return api.post(`/api/data-protection/retention/${d.item.id}/decide`, form);
    },
    onSuccess: () => done("Saved."),
  });
  const scan = useMutation({ mutationFn: () => api.post<{ added: number }>("/api/data-protection/retention/scan"), onSuccess: (r) => done(`${r.added} client(s) added to the retention review.`) });
  function open(d: Dialog, initial: Record<string, string> = {}) { save.reset(); setForm(initial); setDialog(d); }

  if (error) return <div className="flash flash-error">Only an admin or a compliance officer can open the data protection registers.</div>;
  if (isLoading || !data) return <p>Loading…</p>;
  const openRequests = data.requests.filter((r) => r.status === "Open");
  const pendingRetention = data.retention.filter((r) => r.status === "Pending");

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Data protection</h1>
          <p className="text-muted">Requests from people about their data, personal data breaches, and the retention review, under the Nigeria Data Protection Act 2023. Client consent is recorded on each client's page.</p>
        </div>
      </div>
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Data subject requests</h2>
          <button type="button" className="btn btn-sm" onClick={() => open({ kind: "request" }, { request_type: "Access", received_on: today() })}>Log a request</button>
        </div>
        <p className="text-muted">Answer within 30 days of receipt. {openRequests.length} open{openRequests.some((r) => r.overdue) ? `, ${openRequests.filter((r) => r.overdue).length} overdue` : ""}.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Request</th><th>From</th><th>Received</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.requests.length === 0 && <tr><td colSpan={6}>No requests logged.</td></tr>}
              {data.requests.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.reference_no}</strong> · {r.request_type}{r.details && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.details}</div>}</td>
                  <td>{r.requester_name}{r.client_id && <div><Link to={`/clients/${r.client_id}`}>{r.client_name}</Link></div>}</td>
                  <td>{r.received_on}</td>
                  <td>{r.due_on}{r.status === "Open" && <div className={r.overdue ? "badge badge-unpaid" : "text-muted"} style={{ fontSize: "0.8rem" }}>{r.overdue ? "Overdue" : `${r.days_left} days left`}</div>}</td>
                  <td>{r.status}{r.outcome && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.outcome}</div>}</td>
                  <td>
                    <div className="actions-row">
                      {r.client_id && (r.request_type === "Access" || r.request_type === "Portability") && <a className="btn btn-sm btn-secondary" href={apiUrl(`/api/data-protection/clients/${r.client_id}/export`)}>Export data</a>}
                      {r.status === "Open" && <button type="button" className="btn btn-sm" onClick={() => open({ kind: "close-request", request: r }, { status: "Completed" })}>Close</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Personal data breaches</h2>
          <button type="button" className="btn btn-sm" onClick={() => open({ kind: "breach" }, { risk: "Medium", aware_at: new Date().toISOString().slice(0, 16) })}>Record a breach</button>
        </div>
        <p className="text-muted">Tell the NDPC within 72 hours of becoming aware, unless the breach is unlikely to put people at risk (record why).</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Breach</th><th>Aware</th><th>Risk</th><th>NDPC</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.breaches.length === 0 && <tr><td colSpan={6}>No breaches recorded.</td></tr>}
              {data.breaches.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.reference_no}</strong><div style={{ fontSize: "0.85rem" }}>{b.description}</div>{b.actions && <div className="text-muted" style={{ fontSize: "0.8rem" }}>Actions: {b.actions}</div>}</td>
                  <td>{b.aware_at}{b.subjects_affected !== null && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{b.subjects_affected} {b.subjects_affected === 1 ? "person" : "people"}</div>}</td>
                  <td>{b.risk}</td>
                  <td>
                    {b.ndpc_notified_on ? `Told ${b.ndpc_notified_on}` : b.not_notified_reason ? <span className="text-muted">Not told: {b.not_notified_reason}</span> : <span className={b.ndpc_overdue ? "badge badge-unpaid" : "badge badge-warning"}>Due by {b.ndpc_deadline}</span>}
                  </td>
                  <td>{b.status}</td>
                  <td>{b.status === "Open" && <button type="button" className="btn btn-sm" onClick={() => open({ kind: "update-breach", breach: b }, { ndpc_notified_on: b.ndpc_notified_on ?? "", subjects_notified_on: b.subjects_notified_on ?? "", not_notified_reason: b.not_notified_reason ?? "", actions: b.actions ?? "", close: "0" })}>Update</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Retention review</h2>
          <button type="button" className="btn btn-sm btn-secondary" disabled={scan.isPending} onClick={() => scan.mutate()}>Look for clients now</button>
        </div>
        <p className="text-muted">Clients whose last policy, claim or payment ended more than 6 years ago, with nothing live or owed. Anonymising replaces the name and clears addresses, contacts, KYC identity data and portal logins; policies and money records stay. {pendingRetention.length} waiting for a decision.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Client</th><th>Relationship ended</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.retention.length === 0 && <tr><td colSpan={5}>No client is past the retention period.</td></tr>}
              {data.retention.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/clients/${r.client_id}`}>{r.client_name}</Link></td>
                  <td>{r.relationship_ended_on}</td>
                  <td>{r.due_on}</td>
                  <td>{r.status}{r.hold_until && r.status === "Held" ? ` until ${r.hold_until}` : ""}{r.note && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.note}{r.decided_by ? ` (${r.decided_by})` : ""}</div>}</td>
                  <td>{r.status === "Pending" && <button type="button" className="btn btn-sm" onClick={() => open({ kind: "retention", item: r }, { decision: "Hold" })}>Decide</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={dialog !== null} title={dialogTitle(dialog)} onClose={() => setDialog(null)} footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
        <button type="button" className={dialog?.kind === "retention" && form.decision === "Anonymise" ? "btn btn-danger" : "btn"} disabled={save.isPending} onClick={() => save.mutate()}>
          {dialog?.kind === "retention" && form.decision === "Anonymise" ? "Anonymise client" : "Save"}
        </button>
      </>}>
        {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
        {dialog?.kind === "request" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="dp_type">Type</label><select id="dp_type" value={form.request_type} onChange={set("request_type")}>{data.requestTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="dp_received">Received on</label><input id="dp_received" type="date" max={today()} value={form.received_on} onChange={set("received_on")} /></div>
            <div className="field"><label htmlFor="dp_name">From</label><input id="dp_name" value={form.requester_name ?? ""} onChange={set("requester_name")} /></div>
            <div className="field"><label htmlFor="dp_contact">Contact</label><input id="dp_contact" value={form.requester_contact ?? ""} onChange={set("requester_contact")} /></div>
            <div className="field"><label htmlFor="dp_client">Client number (if a client)</label><input id="dp_client" inputMode="numeric" value={form.client_id ?? ""} onChange={set("client_id")} placeholder="e.g. 42" /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="dp_details">What they asked for</label><textarea id="dp_details" rows={2} value={form.details ?? ""} onChange={set("details")} /></div>
          </div>
        )}
        {dialog?.kind === "close-request" && (
          <>
            <div className="field"><label htmlFor="dp_status">Outcome</label><select id="dp_status" value={form.status} onChange={set("status")}><option>Completed</option><option>Refused</option></select></div>
            <div className="field"><label htmlFor="dp_outcome">{form.status === "Refused" ? "Lawful reason for refusing" : "What was done"}</label><textarea id="dp_outcome" rows={3} value={form.outcome ?? ""} onChange={set("outcome")} /></div>
          </>
        )}
        {dialog?.kind === "breach" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="br_aware">Became aware at</label><input id="br_aware" type="datetime-local" value={form.aware_at} onChange={set("aware_at")} /></div>
            <div className="field"><label htmlFor="br_risk">Risk to people</label><select id="br_risk" value={form.risk} onChange={set("risk")}><option>Low</option><option>Medium</option><option>High</option></select></div>
            <div className="field"><label htmlFor="br_subjects">People affected</label><input id="br_subjects" inputMode="numeric" value={form.subjects_affected ?? ""} onChange={set("subjects_affected")} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="br_desc">What happened</label><textarea id="br_desc" rows={2} value={form.description ?? ""} onChange={set("description")} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="br_data">Data affected</label><input id="br_data" value={form.data_affected ?? ""} onChange={set("data_affected")} placeholder="e.g. names, phone numbers, policy numbers" /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="br_actions">Actions taken</label><input id="br_actions" value={form.actions ?? ""} onChange={set("actions")} /></div>
          </div>
        )}
        {dialog?.kind === "update-breach" && (
          <div className="form-grid">
            <div className="field"><label htmlFor="bu_ndpc">NDPC told on</label><input id="bu_ndpc" type="date" max={today()} value={form.ndpc_notified_on} onChange={set("ndpc_notified_on")} /></div>
            <div className="field"><label htmlFor="bu_subj">People told on</label><input id="bu_subj" type="date" max={today()} value={form.subjects_notified_on} onChange={set("subjects_notified_on")} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="bu_reason">Why the NDPC was not told (if not)</label><input id="bu_reason" value={form.not_notified_reason} onChange={set("not_notified_reason")} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="bu_actions">Actions taken</label><input id="bu_actions" value={form.actions} onChange={set("actions")} /></div>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 400 }}><input type="checkbox" style={{ width: "auto" }} checked={form.close === "1"} onChange={(e) => setForm((f) => ({ ...f, close: e.target.checked ? "1" : "0" }))} /> Close this breach</label>
          </div>
        )}
        {dialog?.kind === "retention" && (
          <>
            <p style={{ marginTop: 0 }}><strong>{dialog.item.client_name}</strong>: relationship ended {dialog.item.relationship_ended_on}.</p>
            <div className="field"><label htmlFor="rt_decision">Decision</label><select id="rt_decision" value={form.decision} onChange={set("decision")}><option>Hold</option><option>Anonymise</option></select></div>
            {form.decision === "Hold" && <div className="field"><label htmlFor="rt_until">Hold until</label><input id="rt_until" type="date" min={today()} value={form.hold_until ?? ""} onChange={set("hold_until")} /></div>}
            <div className="field"><label htmlFor="rt_note">{form.decision === "Hold" ? "Why it must be kept (required)" : "Note"}</label><textarea id="rt_note" rows={2} value={form.note ?? ""} onChange={set("note")} /></div>
            {form.decision === "Anonymise" && <p className="text-muted">This can't be undone. Uploaded documents stay in file storage; delete them there.</p>}
          </>
        )}
      </Modal>
    </div>
  );
}

function dialogTitle(d: Dialog | null) {
  if (!d) return "";
  if (d.kind === "request") return "Log a data subject request";
  if (d.kind === "close-request") return `Close ${d.request.reference_no}`;
  if (d.kind === "breach") return "Record a personal data breach";
  if (d.kind === "update-breach") return `Update ${d.breach.reference_no}`;
  return "Retention decision";
}

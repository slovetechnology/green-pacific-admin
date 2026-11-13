import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import type { AppraisalMeta } from "../lib/appraisalTypes";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface Finding {
  id: number;
  reference: string;
  title: string;
  detail: string | null;
  source: string;
  severity: string;
  department_id: number;
  department_name: string;
  owner_user_id: number | null;
  owner_username: string | null;
  raised_on: string;
  due_date: string;
  status: "Open" | "Closed";
  closed_on: string | null;
  closure_evidence: string | null;
  overdue: number;
}

const EMPTY = { title: "", detail: "", source: "", severity: "", department_id: "", owner_user_id: "", raised_on: new Date().toISOString().slice(0, 10), due_date: "" };
const SEVERITY_BADGE: Record<string, string> = { High: "badge-high", Medium: "badge-medium", Low: "badge-low" };

// Audit & Internal Control's register of audit and regulator findings.
// Internal audit, compliance and admins write; HR and the MD read. Closure
// by the due date feeds the audit-finding closure KPI, and open High
// findings count against the owning department's head.
export function AuditFindingsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("Open");
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", "findings", status],
    queryFn: () => api.get<{ findings: Finding[]; canWrite: boolean }>(`/api/appraisal/audit-findings${status ? `?status=${status}` : ""}`),
  });
  const search = useRowSearch(data?.findings, (f) => [f.reference, f.title, f.detail, f.department_name, f.owner_username, f.severity, f.source]);
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const [form, setForm] = useState(EMPTY);
  const [closing, setClosing] = useState<Record<number, { closed_on: string; closure_evidence: string }>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function refresh(text: string) {
    setMessage({ kind: "success", text });
    await queryClient.invalidateQueries({ queryKey: ["appraisal", "findings"] });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const r = await api.post<{ finding: Finding }>("/api/appraisal/audit-findings", form);
      setForm(EMPTY);
      await refresh(`Logged ${r.finding.reference}.`);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not log the finding." });
    }
  }

  async function closeFinding(f: Finding) {
    setMessage(null);
    try {
      const c = closing[f.id] ?? { closed_on: new Date().toISOString().slice(0, 10), closure_evidence: "" };
      await api.put(`/api/appraisal/audit-findings/${f.id}`, { status: "Closed", ...c });
      await refresh(`${f.reference} closed.`);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not close the finding." });
    }
  }

  const canWrite = Boolean(data?.canWrite);
  const m = meta.data;

  return (
    <div>
      <div className="page-header">
        <h1>Audit findings</h1>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
          <option value="">All</option>
        </select>
      </div>
      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Reference, title, department or owner…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={[
          { key: "ref", header: "Reference", render: (f) => f.reference },
          { key: "title", header: "Finding", render: (f) => <><strong>{f.title}</strong>{f.detail && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{f.detail}</div>}</> },
          { key: "sev", header: "Severity", render: (f) => <span className={`badge ${SEVERITY_BADGE[f.severity]}`}>{f.severity}</span> },
          { key: "dept", header: "Department", render: (f) => f.department_name },
          { key: "source", header: "Source", render: (f) => f.source },
          { key: "due", header: "Due", render: (f) => <>{f.due_date} {f.overdue ? <span className="badge badge-overdue">Overdue</span> : null}</> },
          {
            key: "status",
            header: "Status",
            render: (f) =>
              f.status === "Closed" ? (
                <span title={f.closure_evidence || ""}>Closed {f.closed_on}</span>
              ) : canWrite ? (
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  <input
                    aria-label={`${f.reference} closure evidence`}
                    placeholder="Evidence it is fixed"
                    value={closing[f.id]?.closure_evidence ?? ""}
                    onChange={(e) => setClosing((c) => ({ ...c, [f.id]: { closed_on: c[f.id]?.closed_on ?? new Date().toISOString().slice(0, 10), closure_evidence: e.target.value } }))}
                  />
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => closeFinding(f)}>Close</button>
                </div>
              ) : (
                "Open"
              ),
          },
        ]}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(f) => f.id}
        emptyMessage="No findings here."
      />

      {canWrite && (
        <div className="card">
          <h2>Log a finding</h2>
          <form onSubmit={create}>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="af-title">Finding</label>
                <input id="af-title" value={form.title} onChange={set("title")} required />
              </div>
              <div className="field">
                <label htmlFor="af-source">Source</label>
                <select id="af-source" value={form.source} onChange={set("source")} required>
                  <option value="">Choose…</option>
                  {m?.findingSources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="af-severity">Severity</label>
                <select id="af-severity" value={form.severity} onChange={set("severity")} required>
                  <option value="">Choose…</option>
                  {m?.findingSeverities.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="af-dept">Owning department</label>
                <select id="af-dept" value={form.department_id} onChange={set("department_id")} required>
                  <option value="">Choose…</option>
                  {m?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="af-owner">Owner</label>
                <select id="af-owner" value={form.owner_user_id} onChange={set("owner_user_id")}>
                  <option value="">None</option>
                  {m?.reviewers.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="af-raised">Raised on</label>
                <input id="af-raised" type="date" value={form.raised_on} onChange={set("raised_on")} required />
              </div>
              <div className="field">
                <label htmlFor="af-due">Due</label>
                <input id="af-due" type="date" value={form.due_date} onChange={set("due_date")} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="af-detail">Detail</label>
              <textarea id="af-detail" rows={2} value={form.detail} onChange={set("detail")} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn">Log finding</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

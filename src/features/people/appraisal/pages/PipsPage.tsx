import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { PIP_STATUS_BADGE, type AppraisalMeta } from "../lib/appraisalTypes";

interface PipRow {
  id: number;
  employee_id: number;
  full_name: string;
  staff_no: string;
  department_name: string;
  reason: string;
  start_date: string;
  end_date: string;
  status: string;
  overdue_checkins: number;
  next_checkin: string | null;
}

interface PipDetail {
  pip: {
    id: number;
    reason: string;
    objectives: { objective: string; measure: string }[];
    start_date: string;
    end_date: string;
    checkin_every_days: number;
    status: string;
    outcome_note: string | null;
    created_by: string;
  };
  employee: { id: number; full_name: string; staff_no: string; job_title: string | null; department_name: string; line_manager_name: string | null };
  checkins: {
    id: number;
    due_date: string;
    held_on: string | null;
    progress: string | null;
    notes: string | null;
    employee_comment: string | null;
    recorded_by: string | null;
    overdue: boolean;
  }[];
  permissions: { manage: boolean; comment: boolean };
}

const PROGRESS = ["On track", "Behind", "Off track"];

// PIPs the user may see: their own, their reports' (anyone below them in the
// org chart), or everyone's for HR.
export function PipsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", "pips", status],
    queryFn: () => api.get<{ pips: PipRow[] }>(`/api/appraisal/pips${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  });
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const [form, setForm] = useState({ employee_id: "", reason: "", start_date: new Date().toISOString().slice(0, 10), end_date: "", checkin_every_days: "14" });
  const [objectives, setObjectives] = useState([{ objective: "", measure: "" }]);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post<PipDetail>("/api/appraisal/pips", { ...form, objectives });
      navigate(`/appraisal/pips/${res.pip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the PIP.");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Improvement plans</h1>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All</option>
          {["Active", "Extended", "Passed", "Failed", "Cancelled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <DataGrid
        columns={[
          { key: "name", header: "Employee", render: (p) => <Link to={`/appraisal/pips/${p.id}`}>{p.full_name}</Link> },
          { key: "dept", header: "Department", render: (p) => p.department_name },
          { key: "period", header: "Period", render: (p) => `${p.start_date} to ${p.end_date}` },
          { key: "next", header: "Next check-in", render: (p) => p.next_checkin || "—" },
          { key: "overdue", header: "Overdue", align: "right", render: (p) => (p.overdue_checkins ? <span className="badge badge-overdue">{p.overdue_checkins}</span> : "0") },
          { key: "status", header: "Status", render: (p) => <span className={`badge ${PIP_STATUS_BADGE[p.status]}`}>{p.status}</span> },
        ]}
        rows={data?.pips}
        isLoading={isLoading}
        getRowKey={(p) => p.id}
        emptyMessage="No improvement plans you can see."
      />

      <div className="card">
        <h2>Start a PIP</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
          HR, or a manager above the employee. Each check-in creates a reminder task for their line manager. A confirmed Major or Critical
          conduct flag needs a PIP before HR can approve the appraisal.
        </p>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={create}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pip-employee">Employee</label>
              <select id="pip-employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
                <option value="">Choose…</option>
                {meta.data?.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.staff_no})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pip-start">Start</label>
              <input id="pip-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="pip-end">End</label>
              <input id="pip-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="pip-every">Check-in every (days)</label>
              <input id="pip-every" type="number" min={7} max={31} value={form.checkin_every_days} onChange={(e) => setForm({ ...form, checkin_every_days: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pip-reason">Why a PIP is needed</label>
            <textarea id="pip-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          </div>
          <div className="section-title">Objectives</div>
          {objectives.map((o, i) => (
            <div className="form-grid" key={i}>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor={`pip-obj-${i}`}>Objective {i + 1}</label>
                <input id={`pip-obj-${i}`} value={o.objective} onChange={(e) => setObjectives((list) => list.map((x, j) => (j === i ? { ...x, objective: e.target.value } : x)))} />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor={`pip-measure-${i}`}>How it will be measured</label>
                <input id={`pip-measure-${i}`} value={o.measure} onChange={(e) => setObjectives((list) => list.map((x, j) => (j === i ? { ...x, measure: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" onClick={() => setObjectives((list) => [...list, { objective: "", measure: "" }])}>
              Add objective
            </button>
            <button type="submit" className="btn">Start PIP</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PipDetailPage() {
  const { pipId } = useParams();
  const queryClient = useQueryClient();
  const key = ["appraisal", "pip", pipId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<PipDetail>(`/api/appraisal/pips/${pipId}`) });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { progress: string; notes: string; held_on: string; comment: string }>>({});
  const [close, setClose] = useState({ outcome: "", note: "", new_end_date: "" });

  async function run(action: () => Promise<PipDetail>, text: string) {
    setMessage(null);
    try {
      queryClient.setQueryData(key, await action());
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "pips"] });
      setMessage({ kind: "success", text });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }

  if (isLoading) return <div className="card">Loading…</div>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load this PIP."}</div>;
  const { pip, employee, checkins, permissions } = data;
  const draft = (id: number) => drafts[id] ?? { progress: "", notes: "", held_on: new Date().toISOString().slice(0, 10), comment: "" };
  // The recording form shows for check-ins already due and the next one;
  // later ones just show their date.
  const today = new Date().toISOString().slice(0, 10);
  const nextUpcoming = checkins.find((c) => !c.held_on && c.due_date > today)?.id;
  const canRecordNow = (c: PipDetail["checkins"][number]) => !c.held_on && (c.due_date <= today || c.id === nextUpcoming);
  const setDraft = (id: number, patch: Partial<ReturnType<typeof draft>>) => setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }));

  return (
    <div>
      <div className="page-header">
        <h1>PIP: {employee.full_name}</h1>
        <div className="page-header-actions">
          <span className={`badge ${PIP_STATUS_BADGE[pip.status]}`}>{pip.status}</span>
        </div>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="card">
        <div className="detail-grid">
          <div><div className="k">Employee</div><div className="v">{employee.full_name} ({employee.staff_no})</div></div>
          <div><div className="k">Department</div><div className="v">{employee.department_name}</div></div>
          <div><div className="k">Line manager</div><div className="v">{employee.line_manager_name || "—"}</div></div>
          <div><div className="k">Period</div><div className="v">{pip.start_date} to {pip.end_date}</div></div>
        </div>
        <p><strong>Why:</strong> {pip.reason}</p>
        <ol>
          {pip.objectives.map((o, i) => (
            <li key={i}>
              {o.objective} <span style={{ color: "var(--text-muted)" }}>(measured by: {o.measure})</span>
            </li>
          ))}
        </ol>
        {pip.outcome_note && <p><strong>Outcome note:</strong> {pip.outcome_note}</p>}
      </div>

      <div className="card">
        <h2>Check-ins</h2>
        {checkins.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--border)", padding: "0.6rem 0" }}>
            <strong>Due {c.due_date}</strong>{" "}
            {c.held_on ? (
              <span className="badge badge-paid">Held {c.held_on}</span>
            ) : c.overdue ? (
              <span className="badge badge-overdue">Overdue</span>
            ) : (
              <span className="badge badge-draft">Upcoming</span>
            )}
            {c.progress && <> · <strong>{c.progress}</strong></>}
            {c.notes && <p style={{ margin: "0.3rem 0" }}>{c.notes} <span style={{ color: "var(--text-muted)" }}>({c.recorded_by})</span></p>}
            {c.employee_comment && <p style={{ margin: "0.3rem 0" }}><strong>Employee:</strong> {c.employee_comment}</p>}

            {permissions.manage && canRecordNow(c) && (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`progress-${c.id}`}>Progress</label>
                  <select id={`progress-${c.id}`} value={draft(c.id).progress} onChange={(e) => setDraft(c.id, { progress: e.target.value })}>
                    <option value="">Choose…</option>
                    {PROGRESS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`held-${c.id}`}>Held on</label>
                  <input id={`held-${c.id}`} type="date" value={draft(c.id).held_on} onChange={(e) => setDraft(c.id, { held_on: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "span 2" }}>
                  <label htmlFor={`notes-${c.id}`}>What was discussed and agreed</label>
                  <input id={`notes-${c.id}`} value={draft(c.id).notes} onChange={(e) => setDraft(c.id, { notes: e.target.value })} />
                </div>
                <div className="field" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => run(() => api.post<PipDetail>(`/api/appraisal/pips/${pip.id}/checkins/${c.id}`, draft(c.id)), "Check-in recorded.")}
                  >
                    Record
                  </button>
                </div>
              </div>
            )}
            {permissions.comment && c.held_on && !c.employee_comment && (
              <div className="field">
                <label htmlFor={`pip-comment-${c.id}`}>Your comment</label>
                <input id={`pip-comment-${c.id}`} value={draft(c.id).comment} onChange={(e) => setDraft(c.id, { comment: e.target.value })} />
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary btn btn-sm"
                    onClick={() => run(() => api.put<PipDetail>(`/api/appraisal/pips/${pip.id}/checkins/${c.id}/comment`, { comment: draft(c.id).comment }), "Comment added.")}
                  >
                    Add comment
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {permissions.manage && (
        <div className="card">
          <h2>Close or extend</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pip-outcome">Outcome</label>
              <select id="pip-outcome" value={close.outcome} onChange={(e) => setClose({ ...close, outcome: e.target.value })}>
                <option value="">Choose…</option>
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                {pip.status === "Active" && <option value="Extended">Extend (once)</option>}
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            {close.outcome === "Extended" && (
              <div className="field">
                <label htmlFor="pip-new-end">New end date</label>
                <input id="pip-new-end" type="date" value={close.new_end_date} onChange={(e) => setClose({ ...close, new_end_date: e.target.value })} />
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="pip-note">Reason</label>
            <textarea id="pip-note" rows={2} value={close.note} onChange={(e) => setClose({ ...close, note: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => run(() => api.post<PipDetail>(`/api/appraisal/pips/${pip.id}/close`, close), "PIP updated.")}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { APPRAISAL_STATUSES, STATUS_BADGE, fmtScore, type AppraisalListRow, type AppraisalMeta, type Cycle } from "../lib/appraisalTypes";

const EMPTY = { name: "", period_start: "", period_end: "", self_due: "", manager_due: "", moderation_due: "", signoff_due: "", appeal_days: "10", forced_distribution: false };

// HR: appraisal cycles.
export function CyclesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["appraisal", "cycles"], queryFn: () => api.get<{ cycles: Cycle[] }>("/api/appraisal/cycles") });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const [probation, setProbation] = useState({ employee_id: "", manager_due: "", signoff_due: "" });
  const [probationMsg, setProbationMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const onProbation = meta.data?.employees.filter((e) => e.status === "Probation") ?? [];

  async function startProbation(e: FormEvent) {
    e.preventDefault();
    setProbationMsg(null);
    try {
      const r = await api.post<{ cycle: Cycle; needsReviewer: unknown[] }>("/api/appraisal/cycles/probation", probation);
      setProbation({ employee_id: "", manager_due: "", signoff_due: "" });
      setProbationMsg({ kind: "success", text: `${r.cycle.name} started.${r.needsReviewer.length ? " It needs a reviewer: the line manager has no login." : ""}` });
      await queryClient.invalidateQueries({ queryKey: ["appraisal"] });
    } catch (err) {
      setProbationMsg({ kind: "error", text: err instanceof ApiError ? err.message : "Could not start the review." });
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/appraisal/cycles", form);
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "cycles"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the cycle.");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Appraisal cycles</h1>
        <div className="page-header-actions">
          <Link to="/appraisal/queues" className="btn-secondary btn-sm">Appeals and adjustments</Link>
          <Link to="/appraisal/reports" className="btn-secondary btn-sm">Reports</Link>
          <Link to="/appraisal/templates" className="btn-secondary btn-sm">Role templates</Link>
          <Link to="/appraisal/conduct-flags" className="btn-secondary btn-sm">Conduct flags</Link>
        </div>
      </div>

      <DataGrid
        columns={[
          {
            key: "name",
            header: "Cycle",
            render: (c) => (
              <>
                <Link to={`/appraisal/cycles/${c.id}`}>{c.name}</Link> {c.cycle_type === "probation" && <span className="badge badge-secondary">Probation</span>}
              </>
            ),
          },
          { key: "period", header: "Period", render: (c) => `${c.period_start} to ${c.period_end}` },
          { key: "status", header: "Status", render: (c) => c.status },
          { key: "progress", header: "Closed", align: "right", render: (c) => `${c.n_closed ?? 0} of ${c.n_appraisals ?? 0}` },
        ]}
        rows={data?.cycles}
        isLoading={isLoading}
        getRowKey={(c) => c.id}
        emptyMessage="No cycles yet. Create the first one below."
      />

      <div className="card">
        <h2>New cycle</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={create}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cycle-name">Name</label>
              <input id="cycle-name" value={form.name} onChange={set("name")} placeholder="FY2026 annual review" required />
            </div>
            <div className="field">
              <label htmlFor="cycle-start">Period start</label>
              <input id="cycle-start" type="date" value={form.period_start} onChange={set("period_start")} required />
            </div>
            <div className="field">
              <label htmlFor="cycle-end">Period end</label>
              <input id="cycle-end" type="date" value={form.period_end} onChange={set("period_end")} required />
            </div>
          </div>
          <div className="section-title">Deadlines</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cycle-self">Self-assessment</label>
              <input id="cycle-self" type="date" value={form.self_due} onChange={set("self_due")} />
            </div>
            <div className="field">
              <label htmlFor="cycle-manager">Manager review</label>
              <input id="cycle-manager" type="date" value={form.manager_due} onChange={set("manager_due")} />
            </div>
            <div className="field">
              <label htmlFor="cycle-moderation">HR moderation</label>
              <input id="cycle-moderation" type="date" value={form.moderation_due} onChange={set("moderation_due")} />
            </div>
            <div className="field">
              <label htmlFor="cycle-signoff">Sign-off</label>
              <input id="cycle-signoff" type="date" value={form.signoff_due} onChange={set("signoff_due")} />
            </div>
          </div>
          <div className="section-title">Rules</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cycle-appeal-days">Appeal window (working days after sign-off)</label>
              <input id="cycle-appeal-days" type="number" min={1} max={30} value={form.appeal_days} onChange={set("appeal_days")} />
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input type="checkbox" checked={form.forced_distribution} onChange={(e) => setForm((f) => ({ ...f, forced_distribution: e.target.checked }))} />
                Forced distribution (pools of 15 or more only)
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn">Create cycle</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Start a probation review</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
          A one-person review from the hire date to the end of probation, weighted 30% KPIs, 45% competencies and 25% conduct. HR records
          Confirm, Extend (once, up to 3 months) or Not confirmed; the decision updates the employee record when the review closes.
        </p>
        {probationMsg && <div className={`flash flash-${probationMsg.kind}`}>{probationMsg.text}</div>}
        <form onSubmit={startProbation}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="probation-employee">Employee on probation</label>
              <select id="probation-employee" value={probation.employee_id} onChange={(e) => setProbation({ ...probation, employee_id: e.target.value })} required>
                <option value="">Choose…</option>
                {onProbation.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} (ends {e.probation_end_date || "not set"})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="probation-manager-due">Manager review due</label>
              <input id="probation-manager-due" type="date" value={probation.manager_due} onChange={(e) => setProbation({ ...probation, manager_due: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="probation-signoff-due">Decision due</label>
              <input id="probation-signoff-due" type="date" value={probation.signoff_due} onChange={(e) => setProbation({ ...probation, signoff_due: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn">Start review</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface LaunchResult {
  created: number;
  skipped: { employee: string; reason: string }[];
  needsReviewer: { id: number; employee: string; reason: string }[];
}

// HR: one cycle's appraisals. Filtering by "HR Moderation" is the
// moderation queue.
export function CycleDetailPage() {
  const { cycleId } = useParams();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const queryClient = useQueryClient();
  const key = ["appraisal", "cycle", cycleId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ cycle: Cycle; appraisals: AppraisalListRow[]; counts: Record<string, number> }>(`/api/appraisal/cycles/${cycleId}`),
  });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string; list?: string[] } | null>(null);

  async function act<T>(path: string, describe: (r: T) => { text: string; list?: string[] }) {
    setMessage(null);
    try {
      const result = await api.post<T>(`/api/appraisal/cycles/${cycleId}/${path}`);
      setMessage({ kind: "success", ...describe(result) });
      await queryClient.invalidateQueries({ queryKey: ["appraisal"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }

  if (isLoading || !data) return <div className="card">Loading…</div>;
  const { cycle, appraisals, counts } = data;
  const rows = status ? appraisals.filter((a) => a.status === status) : appraisals;

  return (
    <div>
      <div className="page-header">
        <h1>{cycle.name}</h1>
        <div className="page-header-actions">
          {cycle.cycle_type === "annual" && <Link to={`/appraisal/cycles/${cycle.id}/calibration`} className="btn-secondary btn-sm">Calibration board</Link>}
          <Link to="/appraisal/cycles" className="btn-secondary btn-sm">All cycles</Link>
        </div>
      </div>

      {message && (
        <div className={`flash flash-${message.kind}`}>
          {message.text}
          {message.list && message.list.length > 0 && (
            <ul style={{ margin: "0.4rem 0 0" }}>
              {message.list.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <div className="detail-grid">
          <div><div className="k">Status</div><div className="v">{cycle.status}</div></div>
          <div><div className="k">Period</div><div className="v">{cycle.period_start} to {cycle.period_end}</div></div>
          <div><div className="k">Self-assessment due</div><div className="v">{cycle.self_due || "—"}</div></div>
          <div><div className="k">Sign-off due</div><div className="v">{cycle.signoff_due || "—"}</div></div>
        </div>
        {cycle.status !== "Closed" && (
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                act("launch", (r: LaunchResult) => ({
                  text: `${r.created} appraisal(s) created.`,
                  list: [
                    ...r.needsReviewer.map((n) => `${n.employee}: needs a reviewer. ${n.reason}`),
                    ...r.skipped.map((s) => `${s.employee}: skipped. ${s.reason}`),
                  ],
                }))
              }
            >
              {cycle.status === "Planned" ? "Launch cycle" : "Add new joiners"}
            </button>
            <button
              type="button"
              className="btn-secondary btn"
              onClick={() =>
                act("open-self-assessment", (r: { moved: number; notMoved: { employee: string; reason: string }[] }) => ({
                  text: `${r.moved} appraisal(s) opened for self-assessment.`,
                  list: r.notMoved.map((n) => `${n.employee}: ${n.reason}`),
                }))
              }
            >
              Open self-assessment for everyone ready
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => act("close", () => ({ text: "Cycle closed." }))}>
              Close cycle
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {}, { replace: true })} aria-label="Stage">
          <option value="">All stages ({appraisals.length})</option>
          {APPRAISAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "HR Moderation" ? "HR Moderation: moderation queue" : s} ({counts[s] ?? 0})
            </option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={[
          { key: "name", header: "Employee", render: (a) => <Link to={`/appraisal/${a.id}`}>{a.full_name}</Link> },
          { key: "dept", header: "Department", render: (a) => a.department_name },
          { key: "family", header: "Template", render: (a) => a.role_family },
          { key: "reviewer", header: "Reviewer", render: (a) => a.reviewer_username || <span className="badge badge-warning">Not assigned</span> },
          { key: "status", header: "Stage", render: (a) => <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span> },
          { key: "final", header: "Score", align: "right", render: (a) => `${fmtScore(a.final_overall)}${a.cap_applied ? " (capped)" : ""}` },
        ]}
        rows={rows}
        isLoading={false}
        getRowKey={(a) => a.id}
        emptyMessage={appraisals.length ? "No appraisals at this stage." : "Launch the cycle to create one appraisal per employee."}
      />
    </div>
  );
}

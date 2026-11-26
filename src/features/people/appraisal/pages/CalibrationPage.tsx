import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import { STATUS_BADGE, fmtScore, type AppraisalMeta, type Cycle } from "../lib/appraisalTypes";

interface BoardRow {
  id: number;
  status: string;
  final_overall: number | null;
  final_band: number | null;
  raw_overall: number | null;
  cap_applied: number | null;
  potential: string | null;
  calibrated_from: number | null;
  calibration_reason: string | null;
  full_name: string;
  job_title: string | null;
  department_name: string;
  reviewer_username: string | null;
  self_gap: number | null;
}

interface Board {
  cycle: Cycle;
  appraisals: BoardRow[];
  distribution: { band: number; label: string; count: number; actualPct: number; guidelinePct: number; guidelineCount: number }[];
  poolSize: number;
  forced: boolean;
  forcedProblem: string | null;
  mean: number | null;
  reviewers: { reviewer: string; count: number; average: number; flag: "Lenient" | "Harsh" | null }[];
  nineBox: { potential: string; performance: string; people: { id: number; name: string }[] }[];
  missingPotential: number;
  sessions: { id: number; held_on: string; participants: string; notes: string | null; department_name: string | null; created_by: string }[];
}

// HR: one cycle's calibration. The distribution is guided (shown against
// the guideline) unless the cycle turns on forced distribution for a pool
// of 15 or more. Individual scores are changed on each appraisal's page,
// with a reason.
export function CalibrationPage() {
  const { cycleId } = useParams();
  const [params, setParams] = useSearchParams();
  const departmentId = params.get("department_id") || "";
  const queryClient = useQueryClient();
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", "calibration", cycleId, departmentId],
    queryFn: () => api.get<Board>(`/api/appraisal/cycles/${cycleId}/calibration${departmentId ? `?department_id=${departmentId}` : ""}`),
  });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [session, setSession] = useState({ held_on: new Date().toISOString().slice(0, 10), participants: "", notes: "" });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["appraisal"] });
  }

  async function recordSession(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.post(`/api/appraisal/cycles/${cycleId}/calibration/sessions`, { ...session, department_id: departmentId || null });
      setSession({ ...session, participants: "", notes: "" });
      setMessage({ kind: "success", text: "Session recorded." });
      await refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not record the session." });
    }
  }

  async function finish() {
    setMessage(null);
    try {
      const r = await api.post<{ moved: number; notMoved: { reason: string }[] }>(`/api/appraisal/cycles/${cycleId}/calibration/finish`, { department_id: departmentId || null });
      setMessage({ kind: "success", text: `${r.moved} appraisal(s) moved to sign-off.${r.notMoved.length ? ` ${r.notMoved.length} couldn't move: ${r.notMoved.map((n) => n.reason).join("; ")}` : ""}` });
      await refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not finish calibration." });
    }
  }

  if (isLoading || !data) return <div className="card">Loading…</div>;
  const maxCount = Math.max(1, ...data.distribution.map((d) => Math.max(d.count, d.guidelineCount)));
  const atCalibration = data.appraisals.filter((a) => a.status === "Calibration").length;

  return (
    <div>
      <div className="page-header">
        <h1>Calibration: {data.cycle.name}</h1>
        <div className="page-header-actions">
          <Link to={`/appraisal/cycles/${cycleId}`} className="btn-secondary btn-sm">Back to the cycle</Link>
        </div>
      </div>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="toolbar">
        <select value={departmentId} onChange={(e) => setParams(e.target.value ? { department_id: e.target.value } : {}, { replace: true })} aria-label="Department">
          <option value="">All departments</option>
          {meta.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <h2>Distribution</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {data.poolSize} scored · mean {fmtScore(data.mean)} ·{" "}
          {data.cycle.forced_distribution
            ? data.forced
              ? "Forced distribution: the top bands can't exceed the guideline."
              : "Forced distribution is on, but applies only to pools of 15 or more."
            : "Guided: the guideline is for discussion, not a quota."}
        </p>
        {data.forcedProblem && <div className="flash flash-error">{data.forcedProblem}</div>}
        <div className="calibration-bars" role="img" aria-label="Actual distribution against the guideline, by band">
          {data.distribution.map((d) => (
            <div key={d.band} className="calibration-bar-row">
              <span className="calibration-bar-label">
                {d.band} · {d.label}
              </span>
              <span className="calibration-bar-track">
                <span className="calibration-bar actual" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                <span className="calibration-bar guideline" style={{ width: `${(d.guidelineCount / maxCount) * 100}%` }} />
              </span>
              <span className="calibration-bar-value">
                {d.count} ({d.actualPct}%) · guide {d.guidelinePct}%
              </span>
            </div>
          ))}
        </div>
        <p className="calibration-legend">
          <span className="swatch actual" /> Actual <span className="swatch guideline" /> Guideline
        </p>
      </div>

      <div className="card">
        <h2>9-box: performance × potential</h2>
        {data.missingPotential > 0 && (
          <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {data.missingPotential} appraisal(s) have no potential rating yet, so they aren't placed.
          </p>
        )}
        <div className="nine-box">
          <span className="nine-box-axis y">Potential ↑</span>
          {data.nineBox.map((cell) => (
            <div key={`${cell.potential}-${cell.performance}`} className="nine-box-cell">
              <span className="nine-box-cell-label">
                {cell.potential} potential · {cell.performance} performance
              </span>
              {cell.people.map((p) => (
                <Link key={p.id} to={`/appraisal/${p.id}`}>{p.name}</Link>
              ))}
            </div>
          ))}
          <span className="nine-box-axis x">Performance →</span>
        </div>
      </div>

      <div className="card">
        <h2>Reviewers</h2>
        <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Flagged when a reviewer's average is more than half a band from the pool's, with at least 3 people reviewed.
        </p>
        <DataGrid
          columns={[
            { key: "r", header: "Reviewer", render: (r) => r.reviewer },
            { key: "n", header: "Reviewed", align: "right", render: (r) => r.count },
            { key: "avg", header: "Average final", align: "right", render: (r) => fmtScore(r.average) },
            { key: "flag", header: "", render: (r) => (r.flag ? <span className="badge badge-warning">{r.flag}</span> : null) },
          ]}
          rows={data.reviewers}
          isLoading={false}
          getRowKey={(r) => r.reviewer}
          emptyMessage="No scored appraisals yet."
        />
      </div>

      <DataGrid
        columns={[
          { key: "name", header: "Employee", render: (a) => <Link to={`/appraisal/${a.id}`}>{a.full_name}</Link> },
          { key: "dept", header: "Department", render: (a) => a.department_name },
          { key: "reviewer", header: "Reviewer", render: (a) => a.reviewer_username || "—" },
          { key: "stage", header: "Stage", render: (a) => <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span> },
          {
            key: "final",
            header: "Final",
            align: "right",
            render: (a) => (
              <>
                {fmtScore(a.final_overall)}
                {a.cap_applied ? " (capped)" : ""}
                {a.calibrated_from !== null && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>was {fmtScore(a.calibrated_from)}</div>}
              </>
            ),
          },
          { key: "band", header: "Band", align: "right", render: (a) => a.final_band ?? "—" },
          { key: "potential", header: "Potential", render: (a) => a.potential || "—" },
          { key: "gap", header: "Self − manager", align: "right", render: (a) => (a.self_gap === null ? "—" : a.self_gap > 0 ? `+${a.self_gap}` : a.self_gap) },
        ]}
        rows={data.appraisals}
        isLoading={false}
        getRowKey={(a) => a.id}
        emptyMessage="Nothing has reached HR moderation yet."
      />

      <div className="card">
        <h2>Sessions</h2>
        <ul>
          {data.sessions.map((s) => (
            <li key={s.id}>
              {s.held_on}
              {s.department_name ? ` (${s.department_name})` : ""}: {s.participants}
              {s.notes ? `. ${s.notes}` : ""}
            </li>
          ))}
          {!data.sessions.length && <li>No sessions recorded yet.</li>}
        </ul>
        <form onSubmit={recordSession}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="session-date">Date</label>
              <input id="session-date" type="date" value={session.held_on} onChange={(e) => setSession({ ...session, held_on: e.target.value })} required />
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="session-participants">Who took part</label>
              <input id="session-participants" value={session.participants} onChange={(e) => setSession({ ...session, participants: e.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="session-notes">Notes</label>
            <textarea id="session-notes" rows={2} value={session.notes} onChange={(e) => setSession({ ...session, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-secondary btn">Record session</button>
            <button type="button" className="btn" disabled={!atCalibration} onClick={finish}>
              Finish calibration ({atCalibration}) and send to sign-off
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

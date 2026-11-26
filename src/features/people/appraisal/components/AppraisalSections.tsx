import { useState } from "react";
import { Link } from "react-router";
import { api } from "@/shared/api/client";
import { APPEAL_GROUNDS, POTENTIAL_LEVELS, PIP_STATUS_BADGE, fmtFigure, fmtScore, type AppraisalDetail } from "../lib/appraisalTypes";

// Phase 2 sections of the appraisal page (AppraisalDetailPage). Each shows
// only what the backend's `permissions` allow.

export type Run = (action: () => Promise<AppraisalDetail>, success: string) => Promise<boolean>;

// ---- appeal ---------------------------------------------------------------------------

export function AppealCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [grounds, setGrounds] = useState("");
  const [details, setDetails] = useState("");
  const [outcome, setOutcome] = useState("");
  const [amended, setAmended] = useState("");
  const [note, setNote] = useState("");
  const { appeal, permissions } = detail;
  if (!appeal && !permissions.fileAppeal) return null;
  const url = `/api/appraisal/appraisals/${detail.appraisal.id}`;

  return (
    <div className="card">
      <h2>Appeal</h2>
      {appeal ? (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{appeal.grounds}</strong>, filed by {appeal.filed_by} on {appeal.filed_at.slice(0, 10)}: {appeal.details}
          </p>
          {appeal.status === "Decided" ? (
            <p>
              <strong>Outcome: {appeal.outcome}</strong>
              {appeal.outcome === "Amended" && ` (score ${fmtScore(appeal.score_before)} → ${fmtScore(appeal.amended_score)})`} by {appeal.decided_by} on{" "}
              {appeal.decided_at?.slice(0, 10)}: {appeal.decision_note}
            </p>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Waiting for the appeal panel.</p>
          )}
        </>
      ) : (
        <p style={{ marginTop: 0 }}>
          Appeal by {detail.appraisal.appeal_deadline} if the appraisal rests on a factual error, a procedure wasn't followed, or you believe it
          was biased. A panel that excludes your reviewer decides. If a figure from the ERP is wrong, say which record.
        </p>
      )}

      {permissions.fileAppeal && (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="appeal-grounds">Grounds</label>
              <select id="appeal-grounds" value={grounds} onChange={(e) => setGrounds(e.target.value)}>
                <option value="">Choose…</option>
                {APPEAL_GROUNDS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="appeal-details">What happened, and what you are asking for</label>
            <textarea id="appeal-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => run(() => api.post<AppraisalDetail>(`${url}/appeals`, { grounds, details }), "Appeal filed.")}>
              File appeal
            </button>
          </div>
        </>
      )}

      {permissions.decideAppeal && (
        <>
          <div className="section-title">Panel decision</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="appeal-outcome">Outcome</label>
              <select id="appeal-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Choose…</option>
                <option value="Upheld">Uphold the appraisal</option>
                <option value="Amended">Amend the final score</option>
                <option value="Re-review">Order a re-review by the reviewer</option>
              </select>
            </div>
            {outcome === "Amended" && (
              <div className="field">
                <label htmlFor="appeal-score">New final score (1 to 5)</label>
                <input id="appeal-score" type="number" min={1} max={5} step="0.01" value={amended} onChange={(e) => setAmended(e.target.value)} />
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="appeal-note">Reasons (for the MD's appeal: the board committee's decision and the date of its minutes)</label>
            <textarea id="appeal-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => run(() => api.post<AppraisalDetail>(`${url}/appeal-decision`, { outcome, amended_score: amended, note }), "Decision recorded.")}
            >
              Record decision
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- calibration and potential ----------------------------------------------------------

export function CalibrationCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const { calibrate, setPotential } = detail.permissions;
  const url = `/api/appraisal/appraisals/${detail.appraisal.id}`;
  const potential = detail.appraisal.potential;
  if (!calibrate && !setPotential && !potential) return null;

  return (
    <div className="card">
      <h2>Calibration</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="potential">Potential (for the 9-box grid)</label>
          {setPotential ? (
            <select
              id="potential"
              value={potential || ""}
              onChange={(e) => run(() => api.put<AppraisalDetail>(`${url}/potential`, { potential: e.target.value }), "Potential saved.")}
            >
              <option value="" disabled>Not set</option>
              {POTENTIAL_LEVELS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <span>{potential || "Not set"}</span>
          )}
        </div>
      </div>
      {calibrate && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Change the final score only for a reason agreed in calibration. A conduct cap can't be lifted.{" "}
            <Link to={`/appraisal/cycles/${detail.cycle.id}/calibration`}>Open the calibration board</Link>
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="calibrated-score">Calibrated final score</label>
              <input id="calibrated-score" type="number" min={1} max={5} step="0.01" placeholder={fmtScore(detail.scores.final)} value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="calibration-reason">Reason</label>
              <input id="calibration-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => run(() => api.put<AppraisalDetail>(`${url}/calibrate`, { final_overall: score, reason }), "Score calibrated.")}>
              Save calibrated score
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- KPI adjustments ----------------------------------------------------------------------

export function AdjustmentsCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [notes, setNotes] = useState<Record<number, string>>({});
  if (!detail.adjustments.length) return null;
  const decide = (id: number, decision: "Approved" | "Rejected") =>
    run(() => api.post<AppraisalDetail>(`/api/appraisal/adjustments/${id}/decide`, { decision, note: notes[id] || "" }), `Adjustment ${decision.toLowerCase()}.`);

  return (
    <div className="card">
      <h2>KPI adjustment requests</h2>
      {detail.adjustments.map((a) => (
        <div key={a.id} style={{ borderTop: "1px solid var(--border)", padding: "0.6rem 0" }}>
          <strong>{a.kpi_name}</strong>: {fmtFigure(a.original_value, a.unit)} → {fmtFigure(a.proposed_value, a.unit)}{" "}
          <span className={`badge ${a.status === "Pending" ? "badge-pending" : a.status === "Approved" ? "badge-paid" : "badge-rejected"}`}>{a.status}</span>
          <p style={{ margin: "0.3rem 0" }}>
            {a.reason} <span style={{ color: "var(--text-muted)" }}>({a.requested_by})</span>
          </p>
          {a.decision_note && (
            <p style={{ margin: "0.3rem 0" }}>
              <strong>{a.decided_by}:</strong> {a.decision_note}
            </p>
          )}
          {a.status === "Pending" && detail.permissions.decideAdjustments && (
            <>
              <div className="field">
                <label htmlFor={`adj-note-${a.id}`}>Reason for the decision</label>
                <input id={`adj-note-${a.id}`} value={notes[a.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => decide(a.id, "Approved")}>Approve</button>
                <button type="button" className="btn-secondary btn" onClick={() => decide(a.id, "Rejected")}>Reject</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- check-ins ---------------------------------------------------------------------------

export function CheckinsCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [label, setLabel] = useState("");
  const [comment, setComment] = useState("");
  const [replies, setReplies] = useState<Record<number, string>>({});
  const { addCheckin, commentCheckins } = detail.permissions;
  if (!detail.checkins.length && !addCheckin) return null;
  const url = `/api/appraisal/appraisals/${detail.appraisal.id}`;

  return (
    <div className="card">
      <h2>Check-ins</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
        A conversation during the year, with a snapshot of the KPI figures at the time. Not a rating.
      </p>
      {detail.checkins.map((c) => (
        <div key={c.id} style={{ borderTop: "1px solid var(--border)", padding: "0.6rem 0" }}>
          <strong>{c.label}</strong> <span style={{ color: "var(--text-muted)" }}>{c.created_at.slice(0, 10)}, {c.created_by}</span>
          <p style={{ margin: "0.3rem 0" }}>{c.manager_comment}</p>
          <p style={{ margin: "0.3rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            KPI score then: {fmtScore(c.kpi_snapshot.kpi_block)} · {c.kpi_snapshot.kpis.map((k) => `${k.name} ${fmtFigure(k.actual, k.unit)}`).join(" · ")}
          </p>
          {c.employee_comment && (
            <p style={{ margin: "0.3rem 0" }}>
              <strong>Employee:</strong> {c.employee_comment}
            </p>
          )}
          {commentCheckins && !c.employee_comment && (
            <div className="field">
              <label htmlFor={`checkin-reply-${c.id}`}>Your comment</label>
              <input id={`checkin-reply-${c.id}`} value={replies[c.id] || ""} onChange={(e) => setReplies((r) => ({ ...r, [c.id]: e.target.value }))} />
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary btn btn-sm"
                  onClick={() => run(() => api.put<AppraisalDetail>(`${url}/checkins/${c.id}`, { employee_comment: replies[c.id] || "" }), "Comment added.")}
                >
                  Add comment
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {addCheckin && (
        <>
          <div className="section-title">Record a check-in</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="checkin-label">Check-in</label>
              <input id="checkin-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Q2, or Month 3 for probation" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="checkin-comment">What was discussed and agreed</label>
            <textarea id="checkin-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const ok = await run(() => api.post<AppraisalDetail>(`${url}/checkins`, { label, manager_comment: comment }), "Check-in recorded.");
                if (ok) {
                  setLabel("");
                  setComment("");
                }
              }}
            >
              Save check-in
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- PIPs -----------------------------------------------------------------------------------

export function PipsCard({ detail }: { detail: AppraisalDetail }) {
  if (!detail.pips.length) return null;
  return (
    <div className="card">
      <h2>Performance improvement plans</h2>
      <ul style={{ margin: 0 }}>
        {detail.pips.map((p) => (
          <li key={p.id}>
            <Link to={`/appraisal/pips/${p.id}`}>
              {p.start_date} to {p.end_date}
            </Link>{" "}
            <span className={`badge ${PIP_STATUS_BADGE[p.status]}`}>{p.status}</span>: {p.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

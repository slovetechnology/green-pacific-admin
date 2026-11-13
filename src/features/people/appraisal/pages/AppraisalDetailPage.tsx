import { SourceBadge } from "@/features/people/hr-admin/components/Badges";
import "@/features/people/hr-admin/hr-admin.css";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import {
  APPRAISAL_STATUSES, PROBATION_STATUSES, FLAG_STATUS_BADGE, SEVERITY_BADGE, STATUS_BADGE,
  evidenceLink, fmtFigure, fmtScore,
  type AppraisalDetail, type AppraisalMeta, type CompetencyRow, type KpiRow,
} from "../lib/appraisalTypes";
import { AppealCard, CalibrationCard, AdjustmentsCard, CheckinsCard, PipsCard, type Run } from "../components/AppraisalSections";
import { FeedbackCard, HistoryCard } from "../components/AppraisalHistoryFeedback";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import "@/shared/styles/executive.css";

type Message = { kind: "success" | "error"; text: string } | null;

// One page for everyone involved in an appraisal: the employee, their
// reviewer, managers above, and HR. What each person can do comes from the
// backend's `permissions` (lib/appraisals.js); nothing here grants access.
export function AppraisalDetailPage() {
  const { appraisalId } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const key = ["appraisal", appraisalId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<AppraisalDetail>(`/api/appraisal/appraisals/${appraisalId}`),
  });
  const [message, setMessage] = useState<Message>(null);

  // Every write returns the refreshed appraisal.
  async function run(action: () => Promise<AppraisalDetail>, success: string) {
    setMessage(null);
    try {
      const next = await action();
      queryClient.setQueryData(key, next);
      await queryClient.invalidateQueries({ queryKey: ["appraisals"] });
      setMessage({ kind: "success", text: success });
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
      return false;
    }
  }

  if (isLoading) return <div className="card">Loading…</div>;
  if (error || !data) return <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load this appraisal."}</div>;
  const d = data;
  const url = `/api/appraisal/appraisals/${d.appraisal.id}`;

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview & actions" },
    { id: "kpis", label: "Objectives & KPIs" },
    { id: "people", label: "Competencies & conduct" },
    { id: "development", label: "Feedback & development" },
    { id: "history", label: "History", count: d.transitions.length },
  ];
  const tab = tabs.some((x) => x.id === searchParams.get("tab")) ? (searchParams.get("tab") as string) : "overview";
  function setTab(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">{d.cycle.name}</span>
          <h1>{d.relation.isSelf ? "My appraisal" : d.employee.full_name}</h1>
        </div>
        <div className="exec-meta">
          <span className={`badge ${STATUS_BADGE[d.appraisal.status]}`}>{d.appraisal.status}</span>
          <span>{d.employee.department_name}</span>
          <span>Next: {nextDeadline(d)}</span>
        </div>
        <div className="exec-header-actions">
          <a className="btn-secondary btn btn-sm" href={apiUrl(`${url}/scorecard.pdf`)}>Download scorecard (PDF)</a>
        </div>
      </header>

      <Stepper detail={d} />
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="card">
        <div className="detail-grid">
          <Field label="Employee">{d.employee.full_name} ({d.employee.staff_no})</Field>
          <Field label="Job title">{d.employee.job_title || "—"}</Field>
          <Field label="Department">{d.employee.department_name}</Field>
          <Field label="Template">{d.template.role_family}, v{d.template.version}</Field>
          <Field label="Cycle">{d.cycle.name}{d.cycle.cycle_type === "probation" && <> <span className="badge badge-secondary">Probation</span></>}</Field>
          <Field label="Period">{d.cycle.period_start} to {d.cycle.period_end}</Field>
          <Field label="Reviewer">
            {d.permissions.setReviewer ? <ReviewerPicker detail={d} run={run} /> : d.reviewer?.username || "Not assigned"}
          </Field>
          <Field label="Next deadline">{nextDeadline(d)}</Field>
        </div>
      </div>

      <section className="exec-workspace" aria-label="Appraisal workspace">
        <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="ap" label="Appraisal views" />

      {tab === "overview" && (
      <div role="tabpanel" id="ap-panel-overview" aria-labelledby="ap-tab-overview" tabIndex={0} className="exec-tabpanel">
      <ActionsCard detail={d} run={run} />
      <AppealCard detail={d} run={run} />
      <ScoresCard detail={d} />
      <CalibrationCard detail={d} run={run} />
      </div>
      )}

      {tab === "kpis" && (
      <div role="tabpanel" id="ap-panel-kpis" aria-labelledby="ap-tab-kpis" tabIndex={0} className="exec-tabpanel">
      <KpiCard detail={d} run={run} />
      <AdjustmentsCard detail={d} run={run} />
      </div>
      )}

      {tab === "people" && (
      <div role="tabpanel" id="ap-panel-people" aria-labelledby="ap-tab-people" tabIndex={0} className="exec-tabpanel">
      <CompetencyCard detail={d} run={run} />
      <FlagsCard detail={d} run={run} />
      </div>
      )}

      {tab === "development" && (
      <div role="tabpanel" id="ap-panel-development" aria-labelledby="ap-tab-development" tabIndex={0} className="exec-tabpanel">
      <CheckinsCard detail={d} run={run} />
      <FeedbackCard detail={d} />
      <PipsCard detail={d} />
      </div>
      )}

      {tab === "history" && (
      <div role="tabpanel" id="ap-panel-history" aria-labelledby="ap-tab-history" tabIndex={0} className="exec-tabpanel">
      <HistoryCard detail={d} />

      <div className="card">
        <h2>History</h2>
        <ul style={{ margin: 0 }}>
          {d.transitions.map((t, i) => (
            <li key={i}>
              {t.created_at.slice(0, 16)}: <strong>{t.to_status}</strong> by {t.actor}
              {t.comment ? `: "${t.comment}"` : ""}
            </li>
          ))}
        </ul>
      </div>
      </div>
      )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{children}</div>
    </div>
  );
}

function nextDeadline(d: AppraisalDetail) {
  const c = d.cycle;
  const due: Record<string, string | null> = {
    "Self Assessment": c.self_due, "Manager Review": c.manager_due, "HR Moderation": c.moderation_due, "Sign-off": c.signoff_due,
    "Appeal Window": d.appraisal.appeal_deadline ? `${d.appraisal.appeal_deadline} (appeals)` : null,
  };
  return due[d.appraisal.status] || "—";
}

// Probation reviews have fewer stages, and "Under Appeal" only shows when
// there is an appeal.
function Stepper({ detail }: { detail: AppraisalDetail }) {
  const status = detail.appraisal.status;
  const stages: readonly string[] =
    detail.cycle.cycle_type === "probation" ? PROBATION_STATUSES : APPRAISAL_STATUSES.filter((s) => s !== "Under Appeal" || detail.appeal);
  const current = stages.indexOf(status);
  return (
    <ol className="appraisal-stepper" aria-label="Appraisal stages">
      {stages.map((s, i) => (
        <li key={s} className={i < current ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

function ReviewerPicker({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const meta = useQuery({ queryKey: ["appraisal", "meta"], queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta") });
  return (
    <select
      aria-label="Reviewer"
      value={detail.reviewer?.id ?? ""}
      onChange={(e) =>
        run(() => api.put<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}/reviewer`, { user_id: Number(e.target.value) }), "Reviewer updated.")
      }
    >
      <option value="" disabled>Not assigned</option>
      {meta.data?.reviewers.map((u) => (
        <option key={u.id} value={u.id}>{u.username}</option>
      ))}
    </select>
  );
}

// ---- actions ---------------------------------------------------------------------

function ActionsCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [comment, setComment] = useState("");
  const [disagree, setDisagree] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [months, setMonths] = useState("3");
  const { actions, acknowledgeObjectives, probationOutcomes } = detail.permissions;
  if (!actions.length && !acknowledgeObjectives) return null;
  const url = `/api/appraisal/appraisals/${detail.appraisal.id}`;
  const needsComment = actions.some((a) => a.requiresComment) || actions.some((a) => a.action === "acknowledge");

  async function go(action: string, label: string) {
    const body = { action, comment, disagree, probation_outcome: outcome || undefined, extension_months: outcome === "Extend" ? months : undefined };
    const ok = await run(() => api.post<AppraisalDetail>(`${url}/transition`, body), `${label}: done.`);
    if (ok) {
      setComment("");
      setDisagree(false);
    }
  }

  return (
    <div className="card">
      <h2>What happens next</h2>
      <p style={{ marginTop: 0 }}>{stageHelp(detail)}</p>
      {acknowledgeObjectives && (
        <p>
          <button type="button" className="btn-secondary btn" onClick={() => run(() => api.post<AppraisalDetail>(`${url}/acknowledge-objectives`), "Objectives acknowledged.")}>
            I've seen my objectives
          </button>
        </p>
      )}
      {actions.some((a) => a.action === "acknowledge") && (
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <input type="checkbox" checked={disagree} onChange={(e) => setDisagree(e.target.checked)} />
          I disagree with this appraisal (you still acknowledge that you have seen it)
        </label>
      )}
      {probationOutcomes.length > 0 && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="probation-outcome">Probation decision</label>
            <select id="probation-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Choose…</option>
              {probationOutcomes.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          {outcome === "Extend" && (
            <div className="field">
              <label htmlFor="extension-months">Extend by (months, once only)</label>
              <select id="extension-months" value={months} onChange={(e) => setMonths(e.target.value)}>
                {["1", "2", "3"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {needsComment && (
        <div className="field">
          <label htmlFor="transition-comment">Comment {actions.some((a) => a.requiresComment) ? "(required to return or skip)" : "(optional)"}</label>
          <textarea id="transition-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      )}
      <div className="form-actions">
        {actions.map((a) => (
          <button key={a.action} type="button" className={a.requiresComment ? "btn-secondary btn" : "btn"} onClick={() => go(a.action, a.label)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function stageHelp(d: AppraisalDetail): string {
  const r = d.relation;
  switch (d.appraisal.status) {
    case "Objectives":
      return r.isSelf ? "Your reviewer is setting this year's targets. You'll be asked to assess yourself once they open it." : "Check the KPI weights and targets below, then open the self-assessment.";
    case "Self Assessment":
      return r.isSelf
        ? "Rate yourself on each competency, enter the figures for KPIs that aren't calculated from the ERP, then submit. ERP figures are fixed when you submit."
        : "The employee is assessing themselves.";
    case "Manager Review":
      return r.isReviewer ? "Rate each competency against its anchors, confirm the entered figures and write your summary. Ratings of 1, 2 or 5 need an evidence note." : "Waiting for the reviewer.";
    case "HR Moderation":
      return r.isHr
        ? `Check completeness and evidence. Conduct flags and KPI adjustment requests must be decided first${d.cycle.cycle_type === "probation" ? ", and record the probation decision." : "."}`
        : "HR is moderating this appraisal.";
    case "Calibration":
      return r.isHr ? "Compare this score with the rest of the pool on the calibration board. Any change needs a reason." : "Scores are being calibrated across the department.";
    case "Sign-off":
      return r.isSelf ? "Read your results, then acknowledge. Acknowledging means you've seen it; you can record disagreement." : "Waiting for the employee to acknowledge.";
    case "Appeal Window":
      return r.isSelf
        ? `You can appeal until ${d.appraisal.appeal_deadline} on the grounds of a factual error, a procedure not followed, or bias. Or accept the result now.`
        : `The employee can appeal until ${d.appraisal.appeal_deadline}.`;
    case "Under Appeal":
      return "An appeal panel is considering this appraisal.";
    default:
      return "This appraisal is closed.";
  }
}

// ---- scores ------------------------------------------------------------------------

function ScoresCard({ detail }: { detail: AppraisalDetail }) {
  const s = detail.scores;
  return (
    <div className="card">
      <h2>Scores {s.indicative && <span className="badge badge-draft">Indicative</span>}</h2>
      <div className="detail-grid">
        <Field label={`KPIs (${s.weights.kpi}%)`}>{fmtScore(s.kpi)}</Field>
        {s.competency !== undefined && <Field label={`Competencies (${s.weights.competency}%)`}>{fmtScore(s.competency)}</Field>}
        {s.conduct !== undefined && <Field label={`Conduct (${s.weights.conduct}%)`}>{fmtScore(s.conduct)}</Field>}
        {s.final !== undefined && (
          <Field label="Final">
            {s.final === null ? (
              <span style={{ color: "var(--text-muted)" }}>After the manager's ratings</span>
            ) : (
              <>
                <strong>{fmtScore(s.final)}</strong>
                {s.band ? ` · band ${s.band}, ${s.bandLabel}` : ""}
              </>
            )}
          </Field>
        )}
        {s.cap ? <Field label="Cap applied">{fmtScore(s.cap)}: {s.capReason}</Field> : null}
        {s.bonusMultiplier !== undefined && s.bonusMultiplier !== null && <Field label="Bonus multiplier">{s.bonusMultiplier}×</Field>}
        {s.calibratedFrom !== undefined && s.calibratedFrom !== null && (
          <Field label="Calibrated">from {fmtScore(s.calibratedFrom)}: {s.calibrationReason}</Field>
        )}
      </div>
      {s.indicative && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 0 }}>
          {detail.relation.isSelf
            ? "Your overall score appears once HR approves the appraisal."
            : "Scores are final once HR approves. Until then they change as ratings and figures change."}
        </p>
      )}
    </div>
  );
}

// ---- KPIs --------------------------------------------------------------------------

function targetText(k: KpiRow) {
  if (k.absolute_rule && k.band_rule) {
    const best = k.band_rule.bands[0];
    if (best.min !== undefined) return `Fixed bands (5 at ${fmtFigure(best.min, k.unit)})`;
    if (best.max !== undefined) return `Fixed bands (5 at ${fmtFigure(best.max, k.unit)})`;
  }
  return k.target_value === null ? "Not set" : `${k.direction === "down" ? "≤ " : ""}${fmtFigure(k.target_value, k.unit)}`;
}

function KpiCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const editing = detail.permissions.editObjectives;
  const [draft, setDraft] = useState<Record<number, { weight: string; target: string }>>({});
  const [evidenceFor, setEvidenceFor] = useState<number | null>(null);

  useEffect(() => {
    setDraft(Object.fromEntries(detail.kpis.map((k) => [k.objective_id, { weight: String(k.weight), target: k.target_value === null ? "" : String(k.target_value) }])));
  }, [detail.kpis]);

  const total = Object.values(draft).reduce((s, v) => s + (Number(v.weight) || 0), 0);

  function saveObjectives() {
    const objectives = detail.kpis.map((k) => ({ objective_id: k.objective_id, weight: draft[k.objective_id]?.weight, target_value: draft[k.objective_id]?.target }));
    run(() => api.put<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}/objectives`, { objectives }), "Objectives saved.");
  }

  return (
    <div className="card">
      <h2>Key performance indicators</h2>
      <div className="exec-table-wrap">
        <table className="exec-table is-static">
          <thead>
            <tr>
              <th>KPI</th>
              <th>Source</th>
              <th style={{ textAlign: "right" }}>Weight</th>
              <th>Target</th>
              <th style={{ textAlign: "right" }}>Actual</th>
              <th style={{ textAlign: "right" }}>Score</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {detail.kpis.map((k) => (
              <KpiRowView
                key={k.objective_id}
                k={k}
                detail={detail}
                run={run}
                editing={editing}
                draft={draft[k.objective_id]}
                setDraft={(v) => setDraft((d) => ({ ...d, [k.objective_id]: v }))}
                showEvidence={() => setEvidenceFor(evidenceFor === k.objective_id ? null : k.objective_id)}
                evidenceOpen={evidenceFor === k.objective_id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="form-actions">
          <span style={{ color: Math.abs(total - 100) < 0.01 ? "var(--text-muted)" : "var(--status-critical)" }}>Weights total {total}%</span>
          <button type="button" className="btn" onClick={saveObjectives}>Save objectives</button>
        </div>
      )}
    </div>
  );
}

function KpiRowView({
  k, detail, run, editing, draft, setDraft, showEvidence, evidenceOpen,
}: {
  k: KpiRow;
  detail: AppraisalDetail;
  run: Run;
  editing: boolean;
  draft: { weight: string; target: string } | undefined;
  setDraft: (v: { weight: string; target: string }) => void;
  showEvidence: () => void;
  evidenceOpen: boolean;
}) {
  const canEnter = detail.permissions.enterManual && k.source_type === "manual";
  const canChallenge = detail.permissions.requestAdjustment.includes(k.objective_id);
  const [challenging, setChallenging] = useState(false);
  const [proposed, setProposed] = useState("");
  const [why, setWhy] = useState("");
  const [value, setValue] = useState(k.actual_value === null ? "" : String(k.actual_value));
  const [insufficient, setInsufficient] = useState(k.insufficient_data);
  const [note, setNote] = useState(k.note || "");
  useEffect(() => {
    setValue(k.actual_value === null ? "" : String(k.actual_value));
    setInsufficient(k.insufficient_data);
    setNote(k.note || "");
  }, [k.actual_value, k.insufficient_data, k.note]);

  function saveFigure() {
    run(
      () => api.put<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}/kpis/${k.objective_id}`, { actual_value: value, insufficient_data: insufficient, note }),
      `${k.name} saved.`
    );
  }

  const status = k.insufficient_data ? k.note || "Insufficient data" : k.score_reason;
  // An approved correction replaces the system figure; show both so nobody mistakes one for the other.
  const approvedAdjustment = detail.adjustments.find((a) => a.objective_id === k.objective_id && a.status === "Approved");
  return (
    <>
      <tr>
        <td>
          <strong>{k.name}</strong>
          {k.description && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{k.description}</div>}
          {k.target_note && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Target guide: {k.target_note}</div>}
        </td>
        <td>
          <SourceBadge source={k.source_type} adjusted={Boolean(approvedAdjustment)} />
          {k.live && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Live until submitted</div>}
          {k.scope_level === "firm" && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Firm-wide</div>}
        </td>
        <td style={{ textAlign: "right" }}>
          {editing && draft ? (
            <input aria-label={`${k.name} weight`} type="number" min={0} step="any" style={{ width: "5rem" }} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} />
          ) : (
            `${k.weight}%`
          )}
        </td>
        <td>
          {editing && draft && !k.absolute_rule ? (
            <input aria-label={`${k.name} target`} type="number" step="any" style={{ width: "7rem" }} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
          ) : (
            targetText(k)
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          {canEnter ? (
            <div style={{ display: "grid", gap: "0.3rem", justifyItems: "end" }}>
              <input aria-label={`${k.name} figure`} type="number" step="any" style={{ width: "7rem" }} value={value} disabled={insufficient} onChange={(e) => setValue(e.target.value)} />
              <label style={{ fontSize: "0.8rem" }}>
                <input type="checkbox" checked={insufficient} onChange={(e) => setInsufficient(e.target.checked)} /> Insufficient data
              </label>
              <input aria-label={`${k.name} note`} placeholder={insufficient ? "Why? (required)" : "Note or source (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="btn-secondary btn btn-sm" onClick={saveFigure}>Save</button>
            </div>
          ) : (
            <>
              {approvedAdjustment && (
                <span className="hr-system-figure" title="Figure the system calculated before the approved correction">
                  {fmtFigure(approvedAdjustment.original_value, k.unit)}
                </span>
              )}
              {fmtFigure(k.actual_value, k.unit)}
              {approvedAdjustment && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>corrected: {approvedAdjustment.reason}</div>}
              {k.entered_by && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>entered by {k.entered_by}</div>}
            </>
          )}
        </td>
        <td style={{ textAlign: "right" }}>
          <strong>{k.score ?? "—"}</strong>
          {status && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{status}</div>}
        </td>
        <td>
          {k.source_type === "auto" ? (
            <div style={{ display: "grid", gap: "0.3rem", justifyItems: "start" }}>
              <button type="button" className="btn-secondary btn btn-sm" onClick={showEvidence} aria-expanded={evidenceOpen}>
                {evidenceOpen ? "Hide" : `${k.evidence_count} record${k.evidence_count === 1 ? "" : "s"}`}
              </button>
              {canChallenge && (
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => setChallenging(!challenging)} aria-expanded={challenging}>
                  Challenge figure
                </button>
              )}
            </div>
          ) : (
            "—"
          )}
        </td>
      </tr>
      {evidenceOpen && (
        <tr>
          <td colSpan={7}>
            <Evidence appraisalId={detail.appraisal.id} kpi={k} />
          </td>
        </tr>
      )}
      {challenging && (
        <tr>
          <td colSpan={7}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`adj-value-${k.objective_id}`}>Corrected figure ({k.unit})</label>
                <input id={`adj-value-${k.objective_id}`} type="number" step="any" value={proposed} onChange={(e) => setProposed(e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor={`adj-reason-${k.objective_id}`}>What the ERP figure got wrong (HR decides)</label>
                <input id={`adj-reason-${k.objective_id}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. CLM-12 was handled by me but logged under a colleague" />
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const ok = await run(
                    () => api.post<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}/kpis/${k.objective_id}/adjustments`, { proposed_value: proposed, reason: why }),
                    "Adjustment requested. HR will decide before approving the appraisal."
                  );
                  if (ok) setChallenging(false);
                }}
              >
                Send to HR
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Evidence({ appraisalId, kpi }: { appraisalId: number; kpi: KpiRow }) {
  const { data, isLoading } = useQuery({
    queryKey: ["appraisal", String(appraisalId), "evidence", kpi.objective_id, kpi.frozen],
    queryFn: () => api.get<{ kpi: KpiRow }>(`/api/appraisal/appraisals/${appraisalId}/kpis/${kpi.objective_id}/evidence`),
  });
  if (isLoading) return <p>Loading records…</p>;
  const items = data?.kpi.evidence || [];
  const k = data?.kpi;
  return (
    <div style={{ background: "var(--surface-2)", padding: "0.5rem 0.75rem" }}>
      {k && k.numerator !== null && k.denominator !== null && (
        <p style={{ marginTop: 0 }}>
          {k.numerator} of {k.denominator}. {k.frozen ? "Fixed when the self-assessment was submitted." : "Recalculated from the ERP each time you open this page."}
        </p>
      )}
      {items.length === 0 ? (
        <p style={{ margin: 0 }}>{kpi.scope_level === "firm" ? "This is a firm-wide figure." : "No records in the period."}</p>
      ) : (
        <ul style={{ margin: 0 }}>
          {items.map((item, i) => {
            const link = evidenceLink(item);
            return (
              <li key={i}>
                {link ? <Link to={link}>{item.label}</Link> : item.label}: {item.detail}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---- competencies -------------------------------------------------------------------

function CompetencyCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const { selfRate, managerRate } = detail.permissions;
  const editRole = selfRate ? "self" : managerRate ? "manager" : null;
  const [draft, setDraft] = useState<Record<number, { score: string; comment: string }>>({});
  const [selfSummary, setSelfSummary] = useState("");
  const [managerSummary, setManagerSummary] = useState("");
  const [plan, setPlan] = useState("");

  useEffect(() => {
    if (!editRole) return;
    setDraft(Object.fromEntries(detail.competencies.map((c) => {
      const r = c[editRole];
      return [c.id, { score: r?.score ? String(r.score) : "", comment: r?.comment || "" }];
    })));
    setSelfSummary(detail.appraisal.self_summary || "");
    setManagerSummary(detail.appraisal.manager_summary || "");
    setPlan(detail.appraisal.development_plan || "");
  }, [detail, editRole]);

  function save() {
    const ratings = detail.competencies.map((c) => ({ competency_id: c.id, score: draft[c.id]?.score || null, comment: draft[c.id]?.comment || "" }));
    const body = editRole === "self" ? { ratings, self_summary: selfSummary } : { ratings, manager_summary: managerSummary, development_plan: plan };
    run(() => api.put<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}/ratings`, body), "Ratings saved.");
  }

  return (
    <div className="card">
      <h2>Competencies</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
        Rated 1 to 5 against the anchors. 2 and 4 mean "between the anchors". The manager's ratings make up the competency score.
      </p>
      <div style={{ display: "grid", gap: "1rem" }}>
        {detail.competencies.map((c) => (
          <CompetencyView
            key={c.id}
            c={c}
            editRole={editRole}
            draft={draft[c.id]}
            setDraft={(v) => setDraft((d) => ({ ...d, [c.id]: v }))}
          />
        ))}
      </div>

      {(editRole || detail.appraisal.self_summary || detail.appraisal.manager_summary || detail.appraisal.development_plan) && (
        <div className="section-title">Summary</div>
      )}
      {editRole === "self" ? (
        <div className="field">
          <label htmlFor="self-summary">Your summary of the year</label>
          <textarea id="self-summary" rows={4} value={selfSummary} onChange={(e) => setSelfSummary(e.target.value)} />
        </div>
      ) : (
        detail.appraisal.self_summary && <p><strong>Employee:</strong> {detail.appraisal.self_summary}</p>
      )}
      {editRole === "manager" ? (
        <>
          <div className="field">
            <label htmlFor="manager-summary">Review summary (required)</label>
            <textarea id="manager-summary" rows={4} value={managerSummary} onChange={(e) => setManagerSummary(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="development-plan">Development plan</label>
            <textarea id="development-plan" rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          {detail.appraisal.manager_summary && <p><strong>Manager:</strong> {detail.appraisal.manager_summary}</p>}
          {detail.appraisal.development_plan && <p><strong>Development plan:</strong> {detail.appraisal.development_plan}</p>}
        </>
      )}
      {editRole && (
        <div className="form-actions">
          <button type="button" className="btn" onClick={save}>Save ratings</button>
        </div>
      )}
    </div>
  );
}

function CompetencyView({
  c, editRole, draft, setDraft,
}: {
  c: CompetencyRow;
  editRole: "self" | "manager" | null;
  draft: { score: string; comment: string } | undefined;
  setDraft: (v: { score: string; comment: string }) => void;
}) {
  const needsEvidence = editRole === "manager" && ["1", "2", "5"].includes(draft?.score || "");
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
      <strong>{c.name}</strong> {c.scope === "role" && <span className="badge badge-secondary">Role</span>}
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.2rem 0.75rem", fontSize: "0.85rem", margin: "0.4rem 0" }}>
        <dt>1</dt><dd style={{ margin: 0 }}>{c.anchor_1}</dd>
        <dt>3</dt><dd style={{ margin: 0 }}>{c.anchor_3}</dd>
        <dt>5</dt><dd style={{ margin: 0 }}>{c.anchor_5}</dd>
      </dl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
        {editRole !== "self" && c.self && <span>Self: <strong>{c.self.score ?? "—"}</strong>{c.self.comment ? `: ${c.self.comment}` : ""}</span>}
        {editRole !== "manager" && c.manager && <span>Manager: <strong>{c.manager.score ?? "—"}</strong>{c.manager.comment ? `: ${c.manager.comment}` : ""}</span>}
      </div>
      {editRole && draft && (
        <div className="form-grid" style={{ marginTop: "0.5rem" }}>
          <div className="field">
            <label htmlFor={`rating-${c.id}`}>{editRole === "self" ? "Your rating" : "Your rating as manager"}</label>
            <select id={`rating-${c.id}`} value={draft.score} onChange={(e) => setDraft({ ...draft, score: e.target.value })}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor={`comment-${c.id}`}>{needsEvidence ? "Evidence (required for 1, 2 or 5)" : "Evidence or example"}</label>
            <input id={`comment-${c.id}`} value={draft.comment} onChange={(e) => setDraft({ ...draft, comment: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- conduct flags --------------------------------------------------------------------

function FlagsCard({ detail, run }: { detail: AppraisalDetail; run: Run }) {
  const [responses, setResponses] = useState<Record<number, string>>({});
  if (!detail.flags.length) return null;

  async function respond(flagId: number) {
    await run(async () => {
      await api.post(`/api/appraisal/conduct-flags/${flagId}/respond`, { response: responses[flagId] || "" });
      return api.get<AppraisalDetail>(`/api/appraisal/appraisals/${detail.appraisal.id}`);
    }, "Response recorded.");
  }

  return (
    <div className="card">
      <h2>Conduct flags</h2>
      {detail.flags.map((f) => (
        <div key={f.id} style={{ borderTop: "1px solid var(--border)", padding: "0.6rem 0" }}>
          <span className={`badge ${SEVERITY_BADGE[f.severity]}`}>{f.severity}</span>{" "}
          <span className={`badge ${FLAG_STATUS_BADGE[f.status]}`}>{f.status}</span> <strong>{f.category}</strong>
          <p style={{ margin: "0.3rem 0" }}>{f.description}</p>
          <p style={{ margin: "0.3rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Evidence: {f.evidence} · raised by {f.raised_by} on {f.raised_at.slice(0, 10)}
          </p>
          {f.employee_response && <p style={{ margin: "0.3rem 0" }}><strong>Response:</strong> {f.employee_response}</p>}
          {f.decision_note && <p style={{ margin: "0.3rem 0" }}><strong>Decision ({f.decided_by}):</strong> {f.decision_note}</p>}
          {detail.permissions.respondToFlags && f.status === "Raised" && !f.employee_response && (
            <div className="field">
              <label htmlFor={`flag-response-${f.id}`}>Your response</label>
              <textarea id={`flag-response-${f.id}`} rows={2} value={responses[f.id] || ""} onChange={(e) => setResponses((r) => ({ ...r, [f.id]: e.target.value }))} />
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => respond(f.id)}>Send response</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {!detail.relation.isSelf && <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Decide flags on the <Link to="/appraisal/conduct-flags">Conduct Flags</Link> page.</p>}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtScore, type AppraisalDetail, type AppraisalMeta, type FeedbackView, type HistoryView } from "../lib/appraisalTypes";

// 360° feedback on an appraisal: who was asked (for the reviewer and HR),
// and the anonymous summary once enough people have answered. Never scored.
export function FeedbackCard({ detail }: { detail: AppraisalDetail }) {
  const queryClient = useQueryClient();
  const key = ["appraisal", String(detail.appraisal.id), "feedback"];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<FeedbackView>(`/api/appraisal/appraisals/${detail.appraisal.id}/feedback`) });
  const canRequest = Boolean(data?.canRequest);
  const meta = useQuery({
    queryKey: ["appraisal", "meta"],
    queryFn: () => api.get<AppraisalMeta>("/api/appraisal/meta"),
    enabled: canRequest,
  });
  const [picks, setPicks] = useState([{ user_id: "", relationship: "Peer" }]);
  const [due, setDue] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // The employee sees their feedback from sign-off.
  if (!data || !data.visible) return null;
  const counts = data.counts;
  if (!counts?.asked && !canRequest) return null;
  const scaleQuestions = data.questions.filter((q) => q.type === "scale");
  const textQuestions = data.questions.filter((q) => q.type === "text");

  async function ask() {
    setMessage(null);
    try {
      const respondents = picks.filter((p) => p.user_id).map((p) => ({ user_id: Number(p.user_id), relationship: p.relationship }));
      queryClient.setQueryData(key, await api.post<FeedbackView>(`/api/appraisal/appraisals/${detail.appraisal.id}/feedback-requests`, { respondents, due_date: due || null }));
      setPicks([{ user_id: "", relationship: "Peer" }]);
      setMessage({ kind: "success", text: "Requests sent. Each person gets a task." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not send the requests." });
    }
  }

  return (
    <div className="card">
      <h2>360° feedback</h2>
      <p style={{ marginTop: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
        For development only; it isn't part of the score. Answers are anonymous and appear only once at least {data.minResponses} people have
        answered and nobody is still pending.
      </p>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      {counts && counts.asked > 0 && (
        <p>
          Asked {counts.asked} · answered {counts.submitted} · declined {counts.declined}
          {counts.pending ? ` · waiting for ${counts.pending}` : ""}
          {data.closed ? " · feedback closed" : ""}
        </p>
      )}
      {data.summary ? (
        <>
          <div className="detail-grid">
            {scaleQuestions.map((q) => (
              <div key={q.key}>
                <div className="k">{q.text}</div>
                <div className="v">{fmtScore(data.summary!.averages[q.key])} / 5</div>
              </div>
            ))}
          </div>
          {textQuestions.map((q) => (
            <div key={q.key}>
              <div className="section-title">{q.text}</div>
              <ul>
                {(data.summary!.comments[q.key] || []).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : (
        counts && counts.asked > 0 && <p style={{ color: "var(--text-muted)" }}>The summary appears once enough people have answered.</p>
      )}
      {data.requests && data.requests.length > 0 && (
        <details>
          <summary>Who was asked</summary>
          <ul>
            {data.requests.map((r) => (
              <li key={r.id}>
                {r.username} ({r.relationship}): {r.status}
              </li>
            ))}
          </ul>
        </details>
      )}
      {canRequest && (
        <>
          <div className="section-title">Ask colleagues</div>
          {picks.map((p, i) => (
            <div className="form-grid" key={i}>
              <div className="field">
                <label htmlFor={`fb-user-${i}`}>Colleague</label>
                <select id={`fb-user-${i}`} value={p.user_id} onChange={(e) => setPicks((list) => list.map((x, j) => (j === i ? { ...x, user_id: e.target.value } : x)))}>
                  <option value="">Choose…</option>
                  {meta.data?.colleagues.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name ? `${c.full_name} (${c.username})` : c.username}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`fb-rel-${i}`}>How they work together</label>
                <select id={`fb-rel-${i}`} value={p.relationship} onChange={(e) => setPicks((list) => list.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))}>
                  {(data.relationships || []).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fb-due">Answer by</label>
              <input id="fb-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" onClick={() => setPicks((list) => [...list, { user_id: "", relationship: "Peer" }])}>
              Add another
            </button>
            <button type="button" className="btn" onClick={ask}>Send requests</button>
          </div>
        </>
      )}
    </div>
  );
}

// Signed-off annual appraisals over time, with the department median.
export function HistoryCard({ detail }: { detail: AppraisalDetail }) {
  const { data } = useQuery({
    queryKey: ["appraisal", "history", detail.employee.id],
    queryFn: () => api.get<HistoryView>(`/api/appraisal/employees/${detail.employee.id}/history`),
    retry: false,
  });
  if (!data || data.cycles.length < 1) return null;
  const kpiNames = [...new Map(data.cycles.flatMap((c) => c.kpis.map((k) => [k.code, k.name] as const))).entries()];
  return (
    <div className="card">
      <h2>History across cycles</h2>
      <div className="table-wrap">
        <table className="data-grid-table">
          <thead>
            <tr>
              <th>Cycle</th>
              <th className="num">KPIs</th>
              <th className="num">Competencies</th>
              <th className="num">Conduct</th>
              <th className="num">Final</th>
              <th className="num">Department median</th>
            </tr>
          </thead>
          <tbody>
            {data.cycles.map((c) => (
              <tr key={c.appraisal_id}>
                <td><Link to={`/appraisal/${c.appraisal_id}`}>{c.cycle_name}</Link></td>
                <td className="num">{fmtScore(c.kpi)}</td>
                <td className="num">{fmtScore(c.competency)}</td>
                <td className="num">{fmtScore(c.conduct)}</td>
                <td className="num"><strong>{fmtScore(c.final)}</strong>{c.band ? ` (${c.band})` : ""}</td>
                <td className="num">{c.department_median === null ? "Hidden" : fmtScore(c.department_median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kpiNames.length > 0 && data.cycles.length > 1 && (
        <>
          <div className="section-title">KPI scores by cycle</div>
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead>
                <tr>
                  <th>KPI</th>
                  {data.cycles.map((c) => (
                    <th key={c.appraisal_id} className="num">{c.cycle_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpiNames.map(([code, name]) => (
                  <tr key={code}>
                    <td>{name}</td>
                    {data.cycles.map((c) => (
                      <td key={c.appraisal_id} className="num">{c.kpis.find((k) => k.code === code)?.score ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 0 }}>
        Department medians are hidden when fewer than 3 people were scored.
      </p>
    </div>
  );
}

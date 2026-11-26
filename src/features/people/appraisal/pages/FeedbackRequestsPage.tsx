import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import type { FeedbackQuestion } from "../lib/appraisalTypes";

interface MyRequests {
  questions: FeedbackQuestion[];
  requests: { id: number; relationship: string; due_date: string | null; full_name: string; job_title: string | null; cycle_name: string }[];
}

// 360° feedback asked of the signed-in user. Answers are anonymous: they're
// stored with no link to the person who gave them.
export function FeedbackRequestsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["appraisal", "feedback", "mine"], queryFn: () => api.get<MyRequests>("/api/appraisal/feedback/mine") });
  const [answers, setAnswers] = useState<Record<number, Record<string, string>>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function send(requestId: number, decline = false) {
    setMessage(null);
    try {
      if (decline) await api.post(`/api/appraisal/feedback/${requestId}/decline`);
      else await api.post(`/api/appraisal/feedback/${requestId}`, { answers: answers[requestId] || {} });
      setMessage({ kind: "success", text: decline ? "Declined." : "Thank you. Your feedback was sent anonymously." });
      await queryClient.invalidateQueries({ queryKey: ["appraisal", "feedback", "mine"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not send your feedback." });
    }
  }

  const set = (id: number, key: string, value: string) => setAnswers((a) => ({ ...a, [id]: { ...(a[id] || {}), [key]: value } }));

  return (
    <div>
      <div className="page-header">
        <h1>Feedback requests</h1>
      </div>
      <p style={{ color: "var(--text-muted)" }}>
        Colleagues' reviewers have asked for your view. It helps them develop and isn't part of their score. Your answers can't be traced to
        you: they are stored without your name and shown only when at least three people have answered.
      </p>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      {isLoading ? (
        <div className="card">Loading…</div>
      ) : !data?.requests.length ? (
        <div className="card">Nobody is waiting for your feedback.</div>
      ) : (
        data.requests.map((r) => (
          <div className="card" key={r.id}>
            <h2>
              {r.full_name}
              {r.job_title ? `, ${r.job_title}` : ""}
            </h2>
            <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
              {r.cycle_name} · you as their {r.relationship.toLowerCase()}
              {r.due_date ? ` · please answer by ${r.due_date}` : ""}
            </p>
            {data.questions.map((q) =>
              q.type === "scale" ? (
                <fieldset key={q.key} className="field" style={{ border: "none", padding: 0 }}>
                  <legend>{q.text}</legend>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                        <input type="radio" name={`${r.id}-${q.key}`} checked={answers[r.id]?.[q.key] === String(n)} onChange={() => set(r.id, q.key, String(n))} />
                        {n}
                        {n === 1 ? " (rarely)" : n === 5 ? " (always)" : ""}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <div className="field" key={q.key}>
                  <label htmlFor={`${r.id}-${q.key}`}>{q.text}</label>
                  <textarea id={`${r.id}-${q.key}`} rows={2} value={answers[r.id]?.[q.key] || ""} onChange={(e) => set(r.id, q.key, e.target.value)} />
                </div>
              )
            )}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => send(r.id)}>Send feedback</button>
              <button type="button" className="btn-secondary btn" onClick={() => send(r.id, true)}>Decline</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

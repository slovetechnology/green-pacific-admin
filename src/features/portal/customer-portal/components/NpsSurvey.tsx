import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface Survey {
  trigger_type: "renewal" | "claim_settled";
  entity_id: number;
  event_date: string;
  prompt: string;
}

// One question after a renewal or a settled claim (backend lib/nps.js).
// Shows the most recent unanswered one; renders nothing when there is none.
export function NpsSurvey() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["portal", "nps"],
    queryFn: () => api.get<{ question: string; surveys: Survey[] }>("/api/portal/nps"),
  });
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const survey = data?.surveys[0];

  if (thanks && !survey) {
    return (
      <div className="cp-panel" style={{ padding: "16px 20px", marginBottom: 16 }}>
        Thank you for your feedback.
      </div>
    );
  }
  if (!data || !survey) return null;

  async function send() {
    if (score === null || !survey) return;
    setError(null);
    try {
      await api.post("/api/portal/nps", { trigger_type: survey.trigger_type, entity_id: survey.entity_id, score, comment });
      setScore(null);
      setComment("");
      setThanks(true);
      await queryClient.invalidateQueries({ queryKey: ["portal", "nps"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your answer. Please try again.");
    }
  }

  return (
    <section className="cp-panel" style={{ marginBottom: 16 }} aria-labelledby="nps-title">
      <div className="cp-panel-h">
        <div>
          <h2 id="nps-title">How did we do?</h2>
          <p>{survey.prompt}</p>
        </div>
      </div>
      <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 8 }}>{data.question}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="radiogroup">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                className={score === n ? "cp-btn cp-btn--sm" : "cp-btn cp-btn--ghost cp-btn--sm"}
                style={{ minWidth: 40 }}
                onClick={() => setScore(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--cp-muted)", marginTop: 4 }}>
            <span>0: not at all likely</span>
            <span>10: extremely likely</span>
          </div>
        </fieldset>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Anything you'd like to tell us? (optional)</span>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
        </label>
        {error && <p className="cp-field-error">{error}</p>}
        <div>
          <button type="button" className="cp-btn" disabled={score === null} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface FormOptions {
  channels: string[];
  sources: string[];
}

export function CampaignFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("Email");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: opts } = useQuery({
    queryKey: ["campaigns", "meta"],
    queryFn: () => api.get<FormOptions>("/api/campaigns/meta/form-options"),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ campaignId: number }>("/api/campaigns", {
        name, channel, description, source_type: sourceType, start_date: startDate, end_date: endDate, budget,
      });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate(`/campaigns/${result.campaignId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Campaign</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="name">Campaign name</label>
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="channel">Channel</label>
              <select id="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {(opts?.channels || ["Email"]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field span-3">
              <label htmlFor="description">Description</label>
              <textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="source_type">Source / origin</label>
              <select id="source_type" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                <option value="">—</option>
                {opts?.sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="start_date">Start date</label>
              <input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="end_date">End date</label>
              <input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="budget">Budget</label>
              <input id="budget" type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>Create campaign</button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate("/campaigns")}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { SelectField, TextField, money, today } from "../components/Fields";
import type { ReassignmentPreview } from "../lib/types";
import "../hr-admin.css";

interface Meta {
  reasonCodes: string[];
  users: { id: number; username: string; role: string }[];
  ownedClients: Record<string, number>;
}

const STEPS = ["People & reason", "Review what moves", "Submit for approval"];

// Three steps: who and why, a read-only preview of exactly what would move (and any licence, E&O or
// appointment gaps at the receiving end), then the request. Nothing changes until another person approves it
// and it is executed.
export function ReassignmentWizardPage() {
  const navigate = useNavigate();
  const meta = useQuery({ queryKey: ["hr", "reassign-meta"], queryFn: () => api.get<Meta>("/api/hr-admin/reassignments/meta") });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ from_user_id: "", to_user_id: "", reason_code: "Resignation", reason: "", appraisal_id: "", effective_date: today() });
  const [preview, setPreview] = useState<ReassignmentPreview | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const users = meta.data?.users ?? [];
  const counts = meta.data?.ownedClients ?? {};

  async function loadPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ preview: ReassignmentPreview }>("/api/hr-admin/reassignments/preview", { ...form, scope: "all" });
      setPreview(res.preview);
      setChosen(new Set(res.preview.clients.map((c) => c.id)));
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the preview.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const all = chosen.size === preview.clients.length;
    try {
      const res = await api.post<{ reassignment: { id: number } }>("/api/hr-admin/reassignments", { ...form, scope: all ? "all" : "selected", client_ids: all ? undefined : [...chosen] });
      navigate(`/hr/reassignments/${res.reassignment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  const selected = preview?.clients.filter((c) => chosen.has(c.id)) ?? [];
  const policies = selected.reduce((s, c) => s + c.policies, 0);
  const premium = selected.reduce((s, c) => s + c.premium, 0);
  const userOptions = users.map((u) => ({ value: u.id, label: `${u.username} (${u.role}${counts[u.id] ? `, ${counts[u.id]} clients` : ""})` }));
  const step0Ready = form.from_user_id && form.to_user_id && form.from_user_id !== form.to_user_id && form.reason.trim() && form.effective_date;

  return (
    <div className="hr-page">
      <div className="page-header"><h1>New book reassignment</h1></div>
      <ol className="hr-steps" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} className={i === step ? "is-active" : i < step ? "is-done" : undefined} aria-current={i === step ? "step" : undefined}>{s}</li>)}
      </ol>
      {error && <div className="flash flash-error" role="alert">{error}</div>}

      {step === 0 && (
        <form className="card hr-form" onSubmit={(e) => { e.preventDefault(); void loadPreview(); }}>
          <div className="form-grid">
            <SelectField label="Person being replaced" required value={form.from_user_id} onChange={set("from_user_id")} options={userOptions} />
            <SelectField label="Receiving person" required value={form.to_user_id} onChange={set("to_user_id")} options={userOptions.filter((u) => String(u.value) !== form.from_user_id)} />
            <SelectField label="Reason" blank={null} value={form.reason_code} onChange={set("reason_code")} options={(meta.data?.reasonCodes ?? []).map((r) => ({ value: r, label: r }))} />
            <TextField label="Effective date" type="date" required value={form.effective_date} onChange={set("effective_date")} hint="Policies that end before this date stay with the producer who wrote them." />
            {form.reason_code === "Compliance baseline" && <TextField label="Appraisal number" type="number" required value={form.appraisal_id} onChange={set("appraisal_id")} hint="The appraisal that fell below the compliance baseline." />}
          </div>
          <div className="field">
            <label htmlFor="reassign-why">Explanation</label>
            <textarea id="reassign-why" rows={3} required value={form.reason} onChange={(e) => set("reason")(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={!step0Ready || busy}>{busy ? "Checking…" : "Preview"}</button>
          </div>
        </form>
      )}

      {step === 1 && preview && (
        <div className="card hr-form">
          <h2>{preview.from.username} → {preview.to.username}</h2>
          {preview.warnings.length > 0 && (
            <div className="flash flash-info" role="status">
              <strong>Before this goes ahead:</strong>
              <ul className="hr-plain-list">{preview.warnings.map((w) => <li key={w.code + w.message}>{w.message}</li>)}</ul>
              <small>These don't stop the transfer, but policies written without them will be flagged as compliance exceptions.</small>
            </div>
          )}
          {preview.assetsHeld.length > 0 && (
            <p className="hr-hint">{preview.from.username} still holds equipment: {preview.assetsHeld.map((a) => a.asset_tag).join(", ")}. Recover it under Assets.</p>
          )}
          <p>
            Choose the clients to move. <strong>{selected.length}</strong> of {preview.clients.length} selected · {policies} in-force policies · {money(premium)} premium.
          </p>
          <div className="exec-table-wrap table-wrap">
            <table className="exec-table is-static hr-table">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select all clients" checked={chosen.size === preview.clients.length} onChange={(e) => setChosen(e.target.checked ? new Set(preview.clients.map((c) => c.id)) : new Set())} /></th>
                  <th>Client</th><th className="num">Policies</th><th className="num">Premium</th>
                </tr>
              </thead>
              <tbody>
                {preview.clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input type="checkbox" aria-label={`Move ${c.name}`} checked={chosen.has(c.id)} onChange={(e) => setChosen((cur) => { const next = new Set(cur); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} />
                    </td>
                    <td>{c.name}</td><td className="num">{c.policies}</td><td className="num">{money(c.premium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn" disabled={selected.length === 0} onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="card hr-form">
          <h2>Ready to submit</h2>
          <dl className="hr-dl">
            <dt>From</dt><dd>{preview.from.username}</dd>
            <dt>To</dt><dd>{preview.to.username}</dd>
            <dt>Reason</dt><dd>{form.reason_code}: {form.reason}</dd>
            <dt>Effective</dt><dd>{form.effective_date}</dd>
            <dt>Moves</dt><dd>{selected.length} clients, {policies} policies, {money(premium)} premium</dd>
          </dl>
          <p className="hr-hint">The request goes to the MD or an admin for approval. Nothing moves until it is approved and you execute it.</p>
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit for approval"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

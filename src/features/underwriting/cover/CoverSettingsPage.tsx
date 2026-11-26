import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";

// No Premium, No Cover settings (backend underwriting/cover/coverStatus.js): the classes where a new policy's cover
// waits for the premium, and how long after the start date it holds while unpaid. Only admins change them.

interface Settings { blockClasses: string[]; graceDays: number; scheduleVerifyMode: string; classes: string[] }

export function CoverSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["cover", "settings"], queryFn: () => api.get<Settings>("/api/cover/settings") });
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [grace, setGrace] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  if (isLoading || !data) return <div className="exec"><p className="exec-state">Loading…</p></div>;
  const blocks = chosen ?? data.blockClasses;
  const days = grace ?? String(data.graceDays);
  const canEdit = Boolean(user?.isAdmin);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.put("/api/cover/settings", { blockClasses: blocks, graceDays: Number(days) });
      await queryClient.invalidateQueries({ queryKey: ["cover", "settings"] });
      setChosen(null);
      setGrace(null);
      setMessage({ tone: "ok", text: "Saved. New policies follow these settings; existing cover is unchanged." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The settings could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="exec">
      <header className="exec-header">
        <div><span className="exec-eyebrow">Underwriting</span><h1>No Premium, No Cover</h1></div>
        <div className="exec-meta"><span>Insurance Act 2003 s.50: cover isn't in force until the premium is received.</span></div>
      </header>
      <form onSubmit={save}>
        <section className="exec-panel" style={{ padding: "1rem" }}>
          <p className="pl-hint">
            In a ticked class, a new Agency Bill policy starts <b>Pending Payment</b>: cover holds for the grace period from its start date, goes <b>In Force</b> once the premium is paid in full,
            and is <b>Suspended</b> if it is still unpaid after that. Its policy document waits for payment (a cover note serves meanwhile). Other classes keep today's compliance warning.
            Only an admin can override, with a reason. Policies already on the books are not affected.
          </p>
          {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
          <div className="pl-inline-form">
            <div className="field"><label htmlFor="cv-grace">Grace period (days after the start date)</label><input id="cv-grace" type="number" min="0" max="365" step="1" value={days} onChange={(e) => setGrace(e.target.value)} disabled={!canEdit} /></div>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: "0.6rem 0" }} disabled={!canEdit}>
            <legend className="exec-sub">Classes where cover waits for the premium ({blocks.length})</legend>
            <div className="pl-actions">
              {data.classes.map((c) => (
                <label key={c} className="pl-check"><input type="checkbox" checked={blocks.includes(c)} onChange={(e) => setChosen(e.target.checked ? [...blocks, c] : blocks.filter((x) => x !== c))} /> {c}</label>
              ))}
            </div>
          </fieldset>
          <p className="pl-hint">Schedule verification before a policy's notes are issued is {data.scheduleVerifyMode === "hard" ? "required (someone other than the person who entered the policy)" : "switched off"}; that is a database setting.</p>
          {canEdit ? <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button> : <p className="pl-hint">Only an admin can change these.</p>}
        </section>
      </form>
    </div>
  );
}

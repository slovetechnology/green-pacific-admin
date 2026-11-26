import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { promptDialog } from "@/shared/components/Dialogs";
import { bindingKey, bindingUrl, type CoverNote } from "../../lib/binding";

// Cover notes for the bound cover (backend sales/binding/coverNotes.js): issued once the instruction to bind is
// approved, valid for at most 90 days, superseded by a later one or by the policy.

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

export function CoverNotesPanel({ dealId, boundInstructionId, canWrite }: { dealId: number; boundInstructionId: number | null; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const key = bindingKey(dealId, "cover-notes");
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ coverNotes: CoverNote[]; maxValidDays: number }>(bindingUrl(dealId, "cover-notes")) });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: key });
      setMessage({ tone: "ok", text: ok });
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (!boundInstructionId) return;
    await run(() => api.post(bindingUrl(dealId, `bind-instructions/${boundInstructionId}/cover-notes`), { valid_from: from || undefined, valid_to: to || undefined }), "Cover note issued. Open its PDF to send it.");
  }

  async function close(c: CoverNote, status: "Superseded" | "Cancelled") {
    const note = await promptDialog({ title: status === "Superseded" ? "Replaced by the policy" : "Cancel the cover note", message: c.cover_note_no, label: status === "Superseded" ? "Note (optional)" : "Why it is cancelled", required: status === "Cancelled", confirmLabel: status === "Superseded" ? "Mark replaced" : "Cancel it" });
    if (note === null) return;
    await run(() => api.post(`/api/cover-notes/${c.id}/close`, { status, note }), status === "Superseded" ? "Marked as replaced by the policy." : "Cover note cancelled.");
  }

  const notes = data?.coverNotes ?? [];
  return (
    <Panel eyebrow="Step 4" title="Cover notes">
      <p className="pl-hint">Evidence of cover until the policy is issued: at most {data?.maxValidDays ?? 90} days. A new one replaces the one before.</p>
      {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
      {notes.length === 0 ? <p className="pl-hint" style={{ margin: 0 }}>{boundInstructionId ? "None issued yet." : "Issued once the instruction to bind is approved."}</p> : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Number</th><th>Valid</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {notes.map((c) => (
                <tr key={c.id}>
                  <td>{c.cover_note_no}<div className="pl-hint">{c.insurer_name} · by {c.issued_by}</div></td>
                  <td>{c.valid_from} to {c.valid_to}{c.days_left !== null && <div className="pl-hint">{c.days_left < 0 ? "Past its date" : `${c.days_left} day${c.days_left === 1 ? "" : "s"} left`}</div>}</td>
                  <td><StatusBadge status={c.status} />{c.status_note && <div className="pl-hint">{c.status_note}</div>}</td>
                  <td>
                    <div className="pl-actions">
                      <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/cover-notes/${c.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
                      {canWrite && c.status === "Issued" && <button type="button" className="btn-link" onClick={() => close(c, "Superseded")} disabled={busy}>Policy issued</button>}
                      {canWrite && c.status === "Issued" && <button type="button" className="btn-link" onClick={() => close(c, "Cancelled")} disabled={busy}>Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && boundInstructionId && (
        <form onSubmit={issue} className="pl-inline-form" style={{ marginTop: "0.8rem" }} aria-label="Issue a cover note">
          <div className="field"><label htmlFor="cn-from">Valid from</label><input id="cn-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="field-hint">Blank: today, or the start of cover if later</span></div>
          <div className="field"><label htmlFor="cn-to">Valid to</label><input id="cn-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /><span className="field-hint">Blank: 30 days</span></div>
          <div className="field"><button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Issuing…" : notes.some((c) => c.status === "Issued") ? "Issue a replacement" : "Issue a cover note"}</button></div>
        </form>
      )}
    </Panel>
  );
}

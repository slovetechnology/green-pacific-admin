import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { promptDialog } from "@/shared/components/Dialogs";
import { bindingKey, bindingUrl, type Proposal } from "../../lib/binding";

// The proposal the client is shown, built from a frozen quote comparison (backend sales/binding/proposals.js).

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

export function ProposalsPanel({ dealId, canWrite, contacts, goTo }: {
  dealId: number; canWrite: boolean; contacts: { id: number; name: string; email: string | null }[]; goTo: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const key = bindingKey(dealId, "proposals");
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ proposals: Proposal[]; sentVia: string[] }>(bindingUrl(dealId, "proposals")) });
  const [creating, setCreating] = useState(false);
  const [letter, setLetter] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [sending, setSending] = useState<Proposal | null>(null);
  const [via, setVia] = useState("Email");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; noSheet?: boolean } | null>(null);

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ["deals", String(dealId)] });
      setMessage({ tone: "ok", text: ok });
      return true;
    } catch (err) {
      const noSheet = err instanceof ApiError && Array.isArray(err.data?.missing) && (err.data.missing as { code: string }[]).some((m) => m.code === "comparison_sheet");
      setMessage({ tone: "error", text: errorText(err), noSheet });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.post(bindingUrl(dealId, "proposals"), { cover_letter: letter, valid_until: validUntil || undefined }), "Proposal prepared. Check its PDF, then send it.")) {
      setCreating(false);
      setLetter("");
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!sending) return;
    if (await run(() => api.post(bindingUrl(dealId, `proposals/${sending.id}/send`), { via, to }), via === "Email" ? "Proposal emailed." : "Proposal recorded as sent.")) setSending(null);
  }

  async function answer(p: Proposal, status: "Accepted" | "Rejected") {
    const note = await promptDialog({ title: `Proposal ${status.toLowerCase()}`, message: `Record that the client ${status === "Accepted" ? "accepted" : "rejected"} proposal v${p.version}.`, label: "Note (optional)", confirmLabel: `Mark ${status.toLowerCase()}` });
    if (note === null) return;
    await run(() => api.patch(bindingUrl(dealId, `proposals/${p.id}`), { status, note }), `Proposal v${p.version} marked ${status.toLowerCase()}.`);
  }

  const proposals = data?.proposals ?? [];
  const emails = contacts.filter((c) => c.email);
  return (
    <Panel
      eyebrow="Step 1"
      title="Proposal to the client"
      actions={canWrite && !creating ? <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>{proposals.length ? "New version" : "Prepare a proposal"}</button> : undefined}
    >
      <p className="pl-hint">Built from the latest frozen quote comparison, with your covering letter. The PDF shows the client the market's terms, never the commission.</p>
      {message && (
        <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>
          {message.text} {message.noSheet && <button type="button" className="btn-link" onClick={() => goTo("quotes")}>Go to Quotes</button>}
        </div>
      )}
      {proposals.length === 0 && !creating && <p className="pl-hint" style={{ margin: 0 }}>None yet.</p>}
      {proposals.length > 0 && (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Version</th><th>Status</th><th>Valid until</th><th>Sent</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id}>
                  <td>v{p.version}<div className="pl-hint">comparison v{p.sheet_version ?? "?"}</div></td>
                  <td><StatusBadge status={p.status} />{p.response_note && <div className="pl-hint">{p.response_note}</div>}</td>
                  <td>{p.valid_until ?? "—"}</td>
                  <td>{p.sent_at ? <>{String(p.sent_at).slice(0, 10)}<div className="pl-hint">{p.sent_via}{p.sent_to ? ` · ${p.sent_to}` : ""}</div></> : "—"}</td>
                  <td>
                    <div className="pl-actions">
                      <a className="btn-secondary btn btn-sm" href={apiUrl(bindingUrl(dealId, `proposals/${p.id}/pdf`))} target="_blank" rel="noreferrer">PDF</a>
                      {canWrite && ["Draft", "Sent"].includes(p.status) && <button type="button" className="btn btn-sm" onClick={() => { setSending(p); setVia(emails.length ? "Email" : "Hand delivery"); setTo(emails[0]?.email ?? ""); }} disabled={busy}>{p.status === "Sent" ? "Send again" : "Send"}</button>}
                      {canWrite && p.status === "Sent" && (
                        <>
                          <button type="button" className="btn-link" onClick={() => answer(p, "Accepted")} disabled={busy}>Accepted</button>
                          <button type="button" className="btn-link" onClick={() => answer(p, "Rejected")} disabled={busy}>Rejected</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <form onSubmit={create} style={{ marginTop: "0.8rem" }}>
          <div className="pl-inline-form">
            <div className="field is-wide"><label htmlFor="pp-letter">Covering letter</label><textarea id="pp-letter" rows={5} value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="Dear …, following our approach to the market, we recommend …" /></div>
            <div className="field"><label htmlFor="pp-valid">Valid until</label><input id="pp-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /><span className="field-hint">Blank: 14 days from today</span></div>
          </div>
          <div className="pl-actions">
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Preparing…" : "Prepare"}</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {sending && (
        <form onSubmit={send} style={{ marginTop: "0.8rem" }} aria-label={`Send proposal v${sending.version}`}>
          <h3 className="exec-sub">Send proposal v{sending.version}</h3>
          <div className="pl-inline-form">
            <div className="field">
              <label htmlFor="pp-via">How</label>
              <select id="pp-via" value={via} onChange={(e) => setVia(e.target.value)}>
                {(data?.sentVia ?? ["Email"]).map((v) => <option key={v} value={v}>{v === "Email" ? "Email it now (PDF attached)" : `Already given: ${v.toLowerCase()}`}</option>)}
              </select>
            </div>
            <div className="field is-wide">
              <label htmlFor="pp-to">{via === "Email" ? "To" : "Given to (optional)"}</label>
              <input id="pp-to" list="pp-contacts" type={via === "Email" ? "email" : "text"} multiple={via === "Email"} required={via === "Email"} value={to} onChange={(e) => setTo(e.target.value)} />
              <datalist id="pp-contacts">{emails.map((c) => <option key={c.id} value={c.email ?? ""}>{c.name}</option>)}</datalist>
            </div>
          </div>
          <div className="pl-actions">
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Sending…" : via === "Email" ? "Email the proposal" : "Record as sent"}</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setSending(null)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </Panel>
  );
}

import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { promptDialog } from "@/shared/components/Dialogs";
import { fmtMoney } from "@/shared/lib/format";
import { marketsKey, marketsUrl, type DealMarkets, type Market, type MarketStatus } from "../../lib/markets";
import { type TabProps } from "./shared";

// The insurers approached on the deal, one row each with its own status (backend sales/pipeline/dealMarkets.js):
// send the slip, record acknowledgements and declines (with a reason), chase on the chase date, and see each
// insurer's history. A recorded quote (Quotes tab) marks its insurer Quoted.

const day = (v: string | null) => (v ? String(v).slice(0, 10) : "—");
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

type Form =
  | { kind: "send"; market: Market; via: string; to: string; message: string; chase_on: string; slip_id: string }
  | { kind: "decline"; market: Market; code: string; reason: string };

export function MarketsTab({ detail, options, canWrite, goTo }: TabProps) {
  const { deal } = detail;
  const queryClient = useQueryClient();
  const key = marketsKey(deal.id);
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<DealMarkets>(marketsUrl(deal.id)) });
  const [adding, setAdding] = useState<number[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  if (isLoading) return <div role="tabpanel" id="deal-panel-markets" aria-labelledby="deal-tab-markets" tabIndex={0} className="exec-tabpanel"><p className="exec-state">Loading the markets…</p></div>;
  if (error || !data) return <div role="tabpanel" id="deal-panel-markets" aria-labelledby="deal-tab-markets" tabIndex={0} className="exec-tabpanel"><p className="exec-state">The markets could not be loaded.</p></div>;

  const canEdit = canWrite && data.editable;
  const onDeal = new Set(data.markets.map((m) => m.insurer_id));
  const addable = (options?.insurers ?? []).filter((i) => !onDeal.has(i.id));

  async function run(label: string, work: () => Promise<DealMarkets>, ok?: string) {
    setBusy(label);
    setMessage(null);
    try {
      const next = await work();
      queryClient.setQueryData(key, next);
      await queryClient.invalidateQueries({ queryKey: ["deals", String(deal.id)], exact: true });
      setForm(null);
      if (ok) setMessage({ tone: "ok", text: ok });
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const move = (m: Market, status: MarketStatus, ok: string) => run(`${status}-${m.id}`, () => api.patch<DealMarkets>(`${marketsUrl(deal.id)}/${m.id}`, { status }), ok);

  async function chase(m: Market) {
    const note = await promptDialog({ title: `Chase ${m.insurer_name}`, message: `Record a chase. The next one falls due in ${data!.chaseDays} days.`, label: "What was said (optional)", multiline: true, confirmLabel: "Record chase" });
    if (note === null) return;
    await run(`chase-${m.id}`, () => api.post<DealMarkets>(`${marketsUrl(deal.id)}/${m.id}/chase`, { note }), `Chase recorded for ${m.insurer_name}.`);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.kind === "send") {
      await run(`send-${form.market.id}`, () => api.post<DealMarkets>(`${marketsUrl(deal.id)}/${form.market.id}/send`, {
        via: form.via, to: form.to, message: form.message, chase_on: form.chase_on || undefined, slip_id: form.slip_id ? Number(form.slip_id) : undefined,
      }), form.via === "Email" ? `Slip emailed to ${form.market.insurer_name}.` : `Recorded as sent to ${form.market.insurer_name}.`);
    } else {
      await run(`decline-${form.market.id}`, () => api.patch<DealMarkets>(`${marketsUrl(deal.id)}/${form.market.id}`, { status: "Declined", declined_reason_code: form.code, declined_reason: form.reason }), `${form.market.insurer_name} marked declined.`);
    }
  }

  const startSend = (m: Market) => setForm({
    kind: "send", market: m, via: data.emailReady ? "Email" : "Phone", to: m.insurer_email ?? "", message: "", chase_on: "",
    slip_id: String(m.slip_id ?? data.slips[0]?.id ?? ""),
  });

  const s = data.summary;
  return (
    <div role="tabpanel" id="deal-panel-markets" aria-labelledby="deal-tab-markets" tabIndex={0} className="exec-tabpanel">
      <Panel
        eyebrow="Market"
        title="Insurers approached"
        actions={
          <div className="pl-actions">
            <span className="pl-chip">{s.total} on the deal</span>
            {s.awaiting > 0 && <span className="pl-chip is-warn">{s.awaiting} waiting</span>}
            {s.byStatus.Quoted > 0 && <span className="pl-chip is-good">{s.byStatus.Quoted} quoted</span>}
            {s.byStatus.Declined > 0 && <span className="pl-chip is-crit">{s.byStatus.Declined} declined</span>}
            {s.chaseDue > 0 && <span className="pl-chip is-crit">{s.chaseDue} to chase</span>}
          </div>
        }
      >
        <p className="pl-hint">
          Each insurer has its own status. Send the slip, record what they answer, and chase them on the chase date ({data.chaseDays} days after sending unless you set one).
          A quote recorded on the <button type="button" className="btn-link" onClick={() => goTo("quotes")}>Quotes tab</button> marks its insurer Quoted.
        </p>
        {deal.stage === "Lead" && <div className="pl-notice" role="status">Qualify the deal before approaching insurers.</div>}
        {canEdit && data.slips.length === 0 && (
          <div className="pl-notice" role="status">No slip yet. <button type="button" className="btn-link" onClick={() => goTo("risk")}>Prepare it on Risk / Slip</button> (“Send to market”), then send it to each insurer here.</div>
        )}
        {!data.emailReady && canEdit && <p className="pl-hint">Email isn't set up on this system, so record how each slip went out (portal, by hand, by phone).</p>}
        {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}

        {data.markets.length === 0 ? (
          <p className="pl-hint" style={{ margin: 0 }}>No insurers yet.{canEdit ? " Add the ones to approach below." : ""}</p>
        ) : (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead><tr><th>Insurer</th><th>Status</th><th>Sent</th><th>Chase</th><th className="num">Quote</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {data.markets.map((m) => (
                  <Fragment key={m.id}>
                    <tr>
                      <td>
                        {m.insurer_name}
                        <div><button type="button" className="btn-link" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? "Hide history" : "History"}</button></div>
                      </td>
                      <td>
                        <StatusBadge status={m.status} />
                        {m.declined_reason_label && <div className="pl-hint">{m.declined_reason_label}{m.declined_reason ? `: ${m.declined_reason}` : ""}</div>}
                        {m.turnaround_days !== null && <div className="pl-hint">Answered in {m.turnaround_days} day{m.turnaround_days === 1 ? "" : "s"}</div>}
                      </td>
                      <td>
                        {m.sent_at ? <>{day(m.sent_at)}<div className="pl-hint">{m.sent_via}{m.sent_to ? ` · ${m.sent_to}` : ""}</div></> : "—"}
                        {m.days_out !== null && <div className="pl-hint">{m.days_out} day{m.days_out === 1 ? "" : "s"} out</div>}
                      </td>
                      <td>
                        {m.chase_on ? <>{m.chase_on}{m.chase_due && <> <span className="pl-chip is-crit">Due</span></>}</> : "—"}
                        {m.chase_count > 0 && <div className="pl-hint">Chased {m.chase_count}×</div>}
                      </td>
                      <td className="num">{m.quote ? fmtMoney(m.quote.premium) : "—"}</td>
                      {canEdit && (
                        <td>
                          <div className="pl-actions">
                            {m.next_statuses.includes("Sent") && <button type="button" className="btn btn-sm" onClick={() => startSend(m)} disabled={busy !== null || data.slips.length === 0}>{m.status === "Draft" ? "Send" : "Send again"}</button>}
                            {(m.status === "Sent" || m.status === "Acknowledged") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => chase(m)} disabled={busy !== null}>Chase</button>}
                            {m.next_statuses.includes("Acknowledged") && <button type="button" className="btn-link" onClick={() => move(m, "Acknowledged", `${m.insurer_name} acknowledged.`)} disabled={busy !== null}>Acknowledged</button>}
                            {m.next_statuses.includes("Declined") && <button type="button" className="btn-link" onClick={() => setForm({ kind: "decline", market: m, code: "", reason: "" })} disabled={busy !== null}>Declined</button>}
                            {m.next_statuses.includes("Expired") && <button type="button" className="btn-link" onClick={() => move(m, "Expired", `${m.insurer_name} marked as no answer.`)} disabled={busy !== null}>No answer</button>}
                            {m.next_statuses.includes("Withdrawn") && m.status !== "Draft" && <button type="button" className="btn-link" onClick={() => move(m, "Withdrawn", `${m.insurer_name} withdrawn.`)} disabled={busy !== null}>Withdraw</button>}
                            {m.status === "Withdrawn" && <button type="button" className="btn-link" onClick={() => move(m, "Draft", `${m.insurer_name} is back to draft.`)} disabled={busy !== null}>Back to draft</button>}
                            {m.status === "Draft" && <button type="button" className="btn-link" onClick={() => run(`remove-${m.id}`, () => api.delete<DealMarkets>(`${marketsUrl(deal.id)}/${m.id}`), `${m.insurer_name} removed.`)} disabled={busy !== null}>Remove</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                    {open === m.id && (
                      <tr>
                        <td colSpan={canEdit ? 6 : 5}>
                          <ol className="pl-hint" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                            {(m.events ?? []).map((e) => (
                              <li key={e.id}>
                                {String(e.created_at).slice(0, 16)} · {e.event === "Status" ? `${e.from_status ?? "—"} → ${e.to_status}` : e.event === "Created" ? `Added as ${e.to_status}` : e.event}
                                {e.note ? `: ${e.note}` : ""}{e.actor ? ` (${e.actor})` : ""}
                              </li>
                            ))}
                          </ol>
                          {m.quote && <p className="pl-hint" style={{ margin: "0.3rem 0 0" }}>Quote {m.quote.quote_reference ?? `#${m.quote.id}`}: {fmtMoney(m.quote.premium)} ({m.quote.status}). <button type="button" className="btn-link" onClick={() => goTo("quotes")}>Compare quotes</button></p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {form && (
          <form onSubmit={submitForm} style={{ marginTop: "0.9rem" }} aria-label={form.kind === "send" ? `Send the slip to ${form.market.insurer_name}` : `${form.market.insurer_name} declined`}>
            {form.kind === "send" ? (
              <>
                <h3 className="exec-sub">Send the slip to {form.market.insurer_name}</h3>
                <div className="pl-inline-form">
                  <div className="field">
                    <label htmlFor="mk-via">How</label>
                    <select id="mk-via" value={form.via} onChange={(e) => setForm({ ...form, via: e.target.value })}>
                      {data.sentVia.map((v) => <option key={v} value={v} disabled={v === "Email" && !data.emailReady}>{v === "Email" ? "Email it now (slip PDF attached)" : `Already sent: ${v.toLowerCase()}`}</option>)}
                    </select>
                  </div>
                  {data.slips.length > 1 && (
                    <div className="field">
                      <label htmlFor="mk-slip">Slip</label>
                      <select id="mk-slip" value={form.slip_id} onChange={(e) => setForm({ ...form, slip_id: e.target.value })}>
                        {data.slips.map((sl) => <option key={sl.id} value={sl.id}>{sl.slip_number} ({sl.slip_type.replace(/_/g, " ").toLowerCase()}, {sl.status.toLowerCase()})</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="mk-to">{form.via === "Email" ? "To" : "Sent to (optional)"}</label>
                    <input id="mk-to" type={form.via === "Email" ? "email" : "text"} multiple={form.via === "Email"} required={form.via === "Email"} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder={form.via === "Email" ? "underwriting@insurer.com" : "Who received it"} />
                  </div>
                  <div className="field"><label htmlFor="mk-chase">Chase on</label><input id="mk-chase" type="date" value={form.chase_on} onChange={(e) => setForm({ ...form, chase_on: e.target.value })} /><span className="field-hint">Blank: in {data.chaseDays} days</span></div>
                  {form.via === "Email" && <div className="field is-wide"><label htmlFor="mk-msg">Add a line to the email (optional)</label><textarea id="mk-msg" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>}
                </div>
                {slipLink(data, form.slip_id)}
              </>
            ) : (
              <>
                <h3 className="exec-sub">{form.market.insurer_name} declined</h3>
                <div className="pl-inline-form">
                  <div className="field">
                    <label htmlFor="mk-reason">Why</label>
                    <select id="mk-reason" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
                      <option value="">Choose…</option>
                      {data.declineReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="field is-wide"><label htmlFor="mk-reason-text">In their words{form.code === "OTHER" ? "" : " (optional)"}</label><textarea id="mk-reason-text" rows={2} required={form.code === "OTHER"} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
                </div>
              </>
            )}
            <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
              <button type="submit" className="btn btn-sm" disabled={busy !== null}>{busy ? "Saving…" : form.kind === "send" ? (form.via === "Email" ? "Email the slip" : "Record as sent") : "Mark declined"}</button>
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => setForm(null)} disabled={busy !== null}>Cancel</button>
            </div>
          </form>
        )}

        {canEdit && addable.length > 0 && !form && (
          <fieldset style={{ border: 0, padding: 0, margin: "1rem 0 0" }}>
            <legend className="exec-sub">Add insurers to approach</legend>
            <div className="pl-actions">
              {addable.map((i) => (
                <label key={i.id} className="pl-check">
                  <input type="checkbox" checked={adding.includes(i.id)} onChange={(e) => setAdding(e.target.checked ? [...adding, i.id] : adding.filter((x) => x !== i.id))} /> {i.name}
                </label>
              ))}
            </div>
            <div className="pl-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-sm" disabled={!adding.length || busy !== null}
                onClick={async () => { if (await run("add", () => api.post<DealMarkets>(marketsUrl(deal.id), { insurer_ids: adding }), `${adding.length} insurer${adding.length === 1 ? "" : "s"} added.`)) setAdding([]); }}>
                {busy === "add" ? "Adding…" : `Add ${adding.length || ""}`.trim()}
              </button>
            </div>
          </fieldset>
        )}
      </Panel>
    </div>
  );
}

function slipLink(data: DealMarkets, slipId: string) {
  const slip = data.slips.find((s) => String(s.id) === slipId) ?? data.slips[0];
  if (!slip) return null;
  return <p className="pl-hint">Slip <Link to={`/broking-slips/${slip.id}`}>{slip.slip_number}</Link> ({slip.status.toLowerCase()}). Check it before it goes out.</p>;
}

import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { confirmDialog, promptDialog } from "@/shared/components/Dialogs";
import { fmtMoney } from "@/shared/lib/format";
import { GateNotice } from "../GateNotice";
import type { GateItem } from "../../lib/types";
import { bindingUrl, type BindInstruction, type BindInstructions } from "../../lib/binding";

// The client's instruction to bind and how the risk is placed (backend sales/binding/bindInstructions.js). One user
// records it; another approves it, and the approval books one policy per insurer under one debit note and wins the deal.

interface LineDraft { insurer_id: string; sharePct: string }
interface LayerDraft { basis_quote_id: string; policy_no: string; sum_insured: string; lines: LineDraft[] }

const pctTotal = (lines: LineDraft[]) => Math.round(lines.reduce((s, l) => s + (Number(l.sharePct) || 0), 0) * 100) / 100;

export function InstructionPanel({ dealId, data, canWrite, isAdmin, onChanged, goTo }: {
  dealId: number; data: BindInstructions; canWrite: boolean; isAdmin: boolean; onChanged: () => Promise<void>; goTo: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const liveQuotes = data.quotes.filter((q) => q.status !== "Declined" && q.currency === "NGN");
  const firstQuote = liveQuotes.find((q) => q.status === "Selected") ?? liveQuotes[0];
  const blankLayer = (): LayerDraft => ({ basis_quote_id: firstQuote ? String(firstQuote.id) : "", policy_no: "", sum_insured: "", lines: [{ insurer_id: firstQuote ? String(firstQuote.insurer_id) : "", sharePct: "100" }] });
  const [recording, setRecording] = useState(false);
  const [f, setF] = useState({ contact: "", name: "", channel: "Email", at: "", evidence: "", proposal: "", notes: "" });
  const [layers, setLayers] = useState<LayerDraft[]>([blankLayer()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; list: string[]; missing: GateItem[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const insurers = [...new Map(data.quotes.map((q) => [q.insurer_id, q.insurer_name])).entries()];

  const setLayer = (i: number, patch: Partial<LayerDraft>) => setLayers(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setLine = (i: number, k: number, patch: Partial<LineDraft>) => setLayer(i, { lines: layers[i].lines.map((l, j) => (j === k ? { ...l, ...patch } : l)) });

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ["deals", String(dealId)] });
      await onChanged();
      setNotice(ok);
      return true;
    } catch (err) {
      const d = err instanceof ApiError ? err.data : null;
      setError({
        text: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
        list: Array.isArray(d?.errors) ? (d.errors as { message: string }[]).map((x) => x.message) : [],
        missing: Array.isArray(d?.missing) ? (d.missing as GateItem[]) : [],
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function record(e: FormEvent) {
    e.preventDefault();
    const body = {
      instructed_by_name: f.name, crm_contact_id: f.contact ? Number(f.contact) : undefined, channel: f.channel, instructed_at: f.at,
      evidence_document_id: f.evidence ? Number(f.evidence) : null, proposal_id: f.proposal ? Number(f.proposal) : undefined, notes: f.notes,
      layers: layers.map((l, i) => ({
        layer_no: i + 1, basis_quote_id: Number(l.basis_quote_id), policy_no: l.policy_no, ...(i > 0 && l.sum_insured ? { sum_insured: l.sum_insured } : {}),
        lines: l.lines.map((x) => ({ insurer_id: Number(x.insurer_id), share: (Number(x.sharePct) || 0) / 100 })),
      })),
    };
    if (await run(() => api.post(bindingUrl(dealId, "bind-instructions"), body), "Instruction recorded. Someone else must now approve it.")) setRecording(false);
  }

  async function approve(b: BindInstruction, extra: Record<string, string> = {}) {
    const lines = b.layers.flatMap((l) => l.lines).length;
    if (!Object.keys(extra).length && !(await confirmDialog({ title: "Approve and bind?", message: `This books ${lines} polic${lines === 1 ? "y" : "ies"} under one debit note and marks the deal Won. It can't be undone here.`, confirmLabel: "Approve and bind" }))) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.post<{ debitNoteNo: string; policies: unknown[]; warnings: string[] }>(bindingUrl(dealId, `bind-instructions/${b.id}/approve`), extra);
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
      await onChanged();
      setNotice(`Bound: ${out.policies.length} polic${out.policies.length === 1 ? "y" : "ies"} on debit note ${out.debitNoteNo}.${out.warnings.length ? ` ${out.warnings.join(" ")}` : ""}`);
    } catch (err) {
      const d = err instanceof ApiError ? err.data : null;
      const missing = Array.isArray(d?.missing) ? (d.missing as GateItem[]) : [];
      // An admin may bind past an unverified KYC with a reason, as on Won.
      if (isAdmin && missing.length && missing.every((m) => m.code === "kyc_verified") && !extra.kyc_override_reason) {
        const reason = await promptDialog({ title: "KYC not verified", message: missing.map((m) => m.message).join(" "), label: "Reason to bind anyway (admin override)", required: true, confirmLabel: "Bind with override" });
        setBusy(false);
        if (reason) await approve(b, { ...extra, kyc_override_reason: reason });
        return;
      }
      setError({ text: err instanceof ApiError ? err.message : "The approval failed.", list: [], missing });
    } finally {
      setBusy(false);
    }
  }

  async function close(b: BindInstruction, action: "reject" | "withdraw") {
    const reason = await promptDialog({ title: action === "reject" ? "Send it back" : "Withdraw the instruction", message: `Instruction from ${b.instructed_by_name}.`, label: "Reason", required: true, multiline: true, confirmLabel: action === "reject" ? "Reject" : "Withdraw" });
    if (reason === null) return;
    await run(() => api.post(bindingUrl(dealId, `bind-instructions/${b.id}/${action}`), { reason }), action === "reject" ? "Instruction rejected." : "Instruction withdrawn.");
  }

  return (
    <Panel eyebrow="Step 3" title="Instruction to bind">
      <p className="pl-hint">
        Record who instructed you to bind, how and when, with the document that shows it, and how the risk is split between insurers. Someone else then approves it; the approval books the policies and wins the deal.
        {data.gateOn ? "" : " (The approval step is switched off for this system, so a deal can also be won directly.)"}
      </p>
      {notice && <div className="flash flash-success" role="status">{notice}</div>}
      {error && (error.missing.length ? <GateNotice message={error.text} items={error.missing} dealId={dealId} tone="crit" /> : (
        <div className="flash flash-error" role="alert">{error.text}{error.list.length > 1 && <ul>{error.list.map((m) => <li key={m}>{m}</li>)}</ul>}</div>
      ))}

      {data.instructions.map((b) => (
        <div key={b.id} className={`pl-notice${b.status === "Bound" ? " is-good" : b.status === "Pending" ? "" : " is-crit"}`} style={{ marginBottom: "0.8rem" }}>
          <h3><StatusBadge status={b.status} /> From {b.instructed_by_name}, by {b.channel.toLowerCase()} on {String(b.instructed_at).slice(0, 16)}</h3>
          <p style={{ margin: "0.2rem 0" }}>
            Evidence: {b.evidence ? (b.evidence.title || b.evidence.doc_type) : "—"} · recorded by {b.recorded_by}
            {b.approved_by && ` · ${b.status === "Rejected" ? "rejected" : "approved"} by ${b.approved_by}`}
            {b.debit_note_no && ` · debit note ${b.debit_note_no}`}
          </p>
          {b.closed_reason && <p style={{ margin: "0.2rem 0" }}>Reason: {b.closed_reason}</p>}
          {b.layers.map((l) => (
            <div key={l.layer_no} className="exec-table-wrap" style={{ marginTop: "0.4rem" }}>
              <table className="exec-table is-static">
                <caption className="exec-sub" style={{ textAlign: "left" }}>{b.layers.length > 1 ? `Layer ${l.layer_no}${l.policy_no ? ` · policy ${l.policy_no}` : ""} · ` : ""}premium {fmtMoney(l.premium)} · sum insured {fmtMoney(l.sum_insured)}</caption>
                <thead><tr><th>Insurer</th><th>Role</th><th className="num">Share</th><th className="num">Premium</th><th className="num">Commission</th><th>Policy</th></tr></thead>
                <tbody>
                  {l.lines.map((x) => (
                    <tr key={x.id}>
                      <td>{x.insurer_name}</td><td>{x.role}</td><td className="num">{Math.round(x.share * 10000) / 100}%</td><td className="num">{fmtMoney(x.premium)}</td>
                      <td className="num">{Math.round(x.commission_rate * 10000) / 100}%</td>
                      <td>{x.transaction_id ? <Link to={`/transactions/${x.transaction_id}`}>#{x.transaction_id}</Link> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {canWrite && b.status === "Pending" && (
            <div className="pl-actions" style={{ marginTop: "0.5rem" }}>
              {b.canApprove ? <button type="button" className="btn btn-sm" onClick={() => approve(b)} disabled={busy}>{busy ? "Binding…" : "Approve and bind"}</button>
                : <span className="pl-hint">You recorded this, so someone else must approve it.</span>}
              {b.canApprove && <button type="button" className="btn-link" onClick={() => close(b, "reject")} disabled={busy}>Reject</button>}
              <button type="button" className="btn-link" onClick={() => close(b, "withdraw")} disabled={busy}>Withdraw</button>
              {data.openAtBind > 0 && <span className="pl-chip is-warn">{data.openAtBind} subjectivit{data.openAtBind === 1 ? "y" : "ies"} to meet first</span>}
            </div>
          )}
        </div>
      ))}

      {canWrite && data.canRecord && !recording && (
        <button type="button" className="btn btn-sm" onClick={() => { setRecording(true); setLayers([blankLayer()]); }} disabled={!liveQuotes.length}>Record the instruction to bind</button>
      )}
      {canWrite && data.canRecord && !liveQuotes.length && <p className="pl-hint">Record the insurers' quotes first (Quotes tab).</p>}

      {recording && (
        <form onSubmit={record} aria-label="Record the instruction to bind">
          <div className="pl-inline-form">
            <div className="field">
              <label htmlFor="bi-contact">Instructed by</label>
              <select id="bi-contact" value={f.contact} onChange={(e) => { const c = data.contacts.find((x) => String(x.id) === e.target.value); setF({ ...f, contact: e.target.value, name: c ? `${c.name}${c.title ? ` (${c.title})` : ""}` : f.name }); }}>
                <option value="">Someone not on the contact list</option>
                {data.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` (${c.title})` : ""}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="bi-name">Name and role</label><input id="bi-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="bi-channel">How</label><select id="bi-channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{data.channels.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="bi-at">When</label><input id="bi-at" type="datetime-local" required value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></div>
            <div className="field is-wide">
              <label htmlFor="bi-evidence">Evidence</label>
              <select id="bi-evidence" required value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })}>
                <option value="">Choose the document…</option>
                {data.documents.map((d) => <option key={d.id} value={d.id}>{d.title || d.doc_type}{d.deal_id ? "" : " (client file)"} · {String(d.uploaded_at ?? "").slice(0, 10)}</option>)}
              </select>
              <span className="field-hint">The email, letter or signed form. Upload it on the <button type="button" className="btn-link" onClick={() => goTo("documents")}>Documents tab</button> first.</span>
            </div>
            {data.proposals.length > 0 && (
              <div className="field"><label htmlFor="bi-proposal">Accepting proposal</label>
                <select id="bi-proposal" value={f.proposal} onChange={(e) => setF({ ...f, proposal: e.target.value })}><option value="">None</option>{data.proposals.filter((p) => p.status !== "Rejected").map((p) => <option key={p.id} value={p.id}>v{p.version} ({p.status.toLowerCase()})</option>)}</select>
              </div>
            )}
            <div className="field is-wide"><label htmlFor="bi-notes">Notes</label><input id="bi-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>

          <h3 className="exec-sub">Placement</h3>
          {layers.map((l, i) => {
            const total = pctTotal(l.lines);
            return (
              <fieldset key={i} className="sch-section" style={{ marginBottom: "0.6rem" }}>
                <legend>{layers.length > 1 ? `Layer ${i + 1}` : "Insurers"} <span className={`pl-chip ${total === 100 ? "is-good" : "is-warn"}`}>{total}% placed</span></legend>
                <div className="pl-inline-form">
                  <div className="field">
                    <label htmlFor={`bi-basis-${i}`}>On the terms of</label>
                    <select id={`bi-basis-${i}`} required value={l.basis_quote_id} onChange={(e) => setLayer(i, { basis_quote_id: e.target.value })}>
                      {liveQuotes.map((q) => <option key={q.id} value={q.id}>{q.insurer_name} · {fmtMoney(q.premium)} (rev {q.revision})</option>)}
                    </select>
                    <span className="field-hint">The lead's quote: its premium is the layer's 100% premium</span>
                  </div>
                  {layers.length > 1 && <div className="field"><label htmlFor={`bi-pol-${i}`}>Policy number</label><input id={`bi-pol-${i}`} required value={l.policy_no} onChange={(e) => setLayer(i, { policy_no: e.target.value })} /></div>}
                  {i > 0 && <div className="field"><label htmlFor={`bi-si-${i}`}>Layer limit (₦)</label><input id={`bi-si-${i}`} type="number" min="0" step="0.01" value={l.sum_insured} onChange={(e) => setLayer(i, { sum_insured: e.target.value })} placeholder="The deal's sum insured" /></div>}
                </div>
                {l.lines.map((x, k) => (
                  <div key={k} className="pl-inline-form">
                    <div className="field">
                      <label htmlFor={`bi-ins-${i}-${k}`}>Insurer</label>
                      <select id={`bi-ins-${i}-${k}`} required value={x.insurer_id} onChange={(e) => setLine(i, k, { insurer_id: e.target.value })}>
                        <option value="">Choose…</option>
                        {insurers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </div>
                    <div className="field"><label htmlFor={`bi-share-${i}-${k}`}>Share (%)</label><input id={`bi-share-${i}-${k}`} type="number" min="0.01" max="100" step="0.01" required value={x.sharePct} onChange={(e) => setLine(i, k, { sharePct: e.target.value })} /></div>
                    {l.lines.length > 1 && <div className="field"><button type="button" className="btn-link" onClick={() => setLayer(i, { lines: l.lines.filter((_, j) => j !== k) })}>Remove</button></div>}
                  </div>
                ))}
                <div className="pl-actions">
                  <button type="button" className="btn-link" onClick={() => setLayer(i, { lines: [...l.lines, { insurer_id: "", sharePct: String(Math.max(0, 100 - total)) }] })}>Add a co-insurer</button>
                  {i > 0 && <button type="button" className="btn-link" onClick={() => setLayers(layers.filter((_, j) => j !== i))}>Remove this layer</button>}
                </div>
              </fieldset>
            );
          })}
          <p className="pl-hint">The insurer of the quote a layer is placed on leads it and must take a line. Only insurers that quoted are listed; each takes its own quoted commission.
            {" "}<button type="button" className="btn-link" onClick={() => setLayers([...layers, blankLayer()])}>Add a layer</button> for a layered programme (each layer its own policy).</p>
          <div className="pl-actions">
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Recording…" : "Record for approval"}</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setRecording(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </Panel>
  );
}

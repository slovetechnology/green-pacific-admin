import { Fragment, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import { describeError, toFraction, toPercent, type CompareQuote, type CompareResponse } from "../../lib/types";
import { isClosed, type TabProps } from "./shared";
import { ComparisonSheets, QuoteRevisions } from "../QuoteHistory";

const moneyIn = (value: number, currency = "NGN") =>
  currency === "NGN" ? fmtMoney(value) : `${currency} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Why a quote changed: a new revision needs one (sales/quotes/quoteRevisions.js).
const CHANGE_REASONS = ["Insurer revised its terms", "Negotiated with the insurer", "Correction of a keying error"];

function limitsToText(limits: Record<string, number>): string {
  return Object.entries(limits).map(([k, v]) => `${k}: ${v}`).join("\n");
}

function textToLimits(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const [name, amount] = line.split(":");
    if (name?.trim() && amount !== undefined) out[name.trim()] = Number(amount.replace(/,/g, "")) || 0;
  }
  return out;
}

export function QuotesTab({ detail, options, canWrite, refresh }: TabProps) {
  const { deal } = detail;
  const closed = isClosed(detail);
  const { data, isLoading } = useQuery({
    queryKey: ["deals", String(deal.id), "compare", detail.quotes.map((q) => `${q.id}:${q.status}:${q.premium}`).join(","), deal.selected_quote_id],
    queryFn: () => api.get<CompareResponse>(`/api/deals/${deal.id}/compare`),
  });
  const [editing, setEditing] = useState<CompareQuote | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const canEdit = canWrite && !closed && deal.stage !== "Lead";

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const quotes = data?.quotes ?? [];
  const recommended = quotes.find((q) => q.isRecommended);
  return (
    <div role="tabpanel" id="deal-panel-quotes" aria-labelledby="deal-tab-quotes" tabIndex={0} className="exec-tabpanel">
      {error && <div className="flash flash-error">{error}</div>}
      {deal.stage === "Lead" && <div className="pl-notice">Qualify the deal first. Quotes are recorded once the risk is going to market.</div>}
      {recommended && !closed && (
        <div className="exec-alert is-good">
          <span className="exec-alert-dot" />
          <p><b>Recommended: {recommended.insurer_name}</b> at {fmtMoney(recommended.premium)}. The lowest premium among quotes that don't exclude a mandatory cover.</p>
        </div>
      )}
      {data && (data.currencies?.length ?? 0) > 1 && (
        <div className="pl-notice" role="status">Some quotes are not in naira. Only naira quotes are compared and recommended.</div>
      )}
      {data && !data.hasCompliantQuote && quotes.length > 0 && (
        <div className="exec-alert is-crit"><span className="exec-alert-dot" /><p>Every quote excludes a mandatory cover for this class. Chase the insurers before presenting any of them.</p></div>
      )}

      <Panel
        eyebrow="Side by side"
        title={`Insurer quotes (${quotes.length})`}
        flush
        actions={canEdit ? <button type="button" className="btn btn-sm" onClick={() => setEditing("new")}>+ Record a quote</button> : undefined}
      >
        {isLoading ? <p className="exec-state">Loading…</p> : quotes.length === 0 ? (
          <p className="exec-state">No quotes yet. Record each insurer's response here as it arrives.</p>
        ) : (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr><th>Insurer</th><th className="num">Premium</th><th className="num">Commission</th><th className="num">Excess</th><th>Mandatory cover</th><th>Status</th>{canEdit && <th><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const selected = data?.selectedQuoteId === q.id;
                  return (
                    <Fragment key={q.id}>
                    <tr className={q.isRecommended ? "is-recommended" : undefined}>
                      <td className="wrap">
                        <b>{q.insurer_name}</b>{q.isRecommended && <span className="exec-best">Recommended</span>}
                        <div className="pl-actions" style={{ gap: "0.3rem", margin: "0.15rem 0" }}>
                          <button type="button" className="pl-chip" aria-expanded={history === q.id} onClick={() => setHistory(history === q.id ? null : q.id)}>Revision {q.revision ?? 1}<span className="sr-only">: show its history</span></button>
                          {q.isPartLine && <span className="pl-chip is-warn" title="The insurer offers part of the risk only">{Math.round(q.lineOffered * 10000) / 100}% line</span>}
                          {q.isExpired && <span className="pl-chip is-crit">Expired {q.valid_until}</span>}
                          {!q.isExpired && q.valid_until && <span className="pl-chip">Valid to {q.valid_until}</span>}
                        </div>
                        {q.quote_reference && <div className="pl-hint">Ref {q.quote_reference}</div>}{q.terms && <div className="pl-hint">{q.terms}</div>}
                        {(q.subjectivities?.length ?? 0) > 0 && <div className="pl-hint">Subject to: {(q.subjectivities ?? []).join("; ")}</div>}
                      </td>
                      <td className="num">{moneyIn(q.premium, q.currency)}</td>
                      <td className="num">{toPercent(q.commission_rate)}%</td>
                      <td className="num">{q.deductible ? fmtMoney(q.deductible) : "—"}</td>
                      <td>
                        {q.excludedMandatoryCoverages.length > 0 && <div className="pl-chip is-crit">Excludes: {q.excludedMandatoryCoverages.join(", ")}</div>}
                        {q.unconfirmedMandatoryCoverages.length > 0 && <div className="pl-chip is-warn" title="Not confirmed in the quote">Unconfirmed: {q.unconfirmedMandatoryCoverages.length}</div>}
                        {q.isFullyConfirmed && <span className="pl-chip is-good">All confirmed</span>}
                      </td>
                      <td>{selected ? <span className="badge badge-won">Selected</span> : <StatusBadge status={q.status === "Selected" ? "Selected" : q.status} />}</td>
                      {canEdit && (
                        <td className="num">
                          <div className="exec-row-actions">
                            {selected ? <button type="button" className="exec-rowbtn" onClick={() => act(() => api.post(`/api/deals/${deal.id}/select-quote`, { quote_id: null }))}>Deselect</button>
                              : q.status !== "Declined" && <button type="button" className="exec-rowbtn" onClick={() => act(() => api.post(`/api/deals/${deal.id}/select-quote`, { quote_id: q.id }))}>Select</button>}
                            <button type="button" className="exec-rowbtn" onClick={() => setEditing(q)}>Edit</button>
                            {!selected && <button type="button" className="exec-rowbtn" onClick={() => act(() => api.patch(`/api/deals/${deal.id}/quotes/${q.id}`, { status: q.status === "Declined" ? "Received" : "Declined" }))}>{q.status === "Declined" ? "Reinstate" : "Decline"}</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                    {history === q.id && (
                      <tr><td colSpan={canEdit ? 7 : 6}><QuoteRevisions dealId={deal.id} quoteId={q.id} /></td></tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {data && data.mandatoryCoverages.length > 0 && (
        <p className="pl-hint">Mandatory for {deal.class_of_business}: {data.mandatoryCoverages.map((c) => c.title).join(", ")}. A quote is checked against these from the clause library.</p>
      )}
      {selectedNote(deal.selected_quote_id, quotes)}
      <ComparisonSheets dealId={deal.id} canFreeze={canEdit} quoteCount={quotes.length} />

      {editing && options && (
        <QuoteForm
          key={editing === "new" ? "new" : editing.id}
          dealId={deal.id}
          options={options}
          quote={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function selectedNote(selectedId: number | null, quotes: CompareQuote[]) {
  const q = quotes.find((x) => x.id === selectedId);
  return q ? <p className="pl-hint">The deal's premium and commission follow the selected quote ({q.insurer_name}).</p> : null;
}

function QuoteForm({ dealId, options, quote, onCancel, onSaved }: { dealId: number; options: NonNullable<TabProps["options"]>; quote: CompareQuote | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    insurer: quote ? String(quote.insurer_id) : "", reference: quote?.quote_reference ?? "", premium: quote ? String(quote.premium) : "",
    ratePct: quote ? String(toPercent(quote.commission_rate)) : "", deductible: quote?.deductible ? String(quote.deductible) : "", terms: quote?.terms ?? "",
    exclusions: quote ? quote.exclusions.join(", ") : "", limits: quote ? limitsToText(quote.coverageLimits) : "",
    currency: quote?.currency ?? "NGN", linePct: quote ? String(Math.round((quote.lineOffered ?? 1) * 10000) / 100) : "100",
    validUntil: quote?.valid_until ?? "", subjectivities: (quote?.subjectivities ?? []).join("\n"), reason: "", reasonNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      quote_reference: f.reference, premium: f.premium, commission_rate: toFraction(f.ratePct), deductible: f.deductible, terms: f.terms,
      exclusions: f.exclusions.split(",").map((s) => s.trim()).filter(Boolean), coverage_limits: textToLimits(f.limits),
      currency: f.currency, line_offered: f.linePct === "" ? 1 : Number(f.linePct) / 100, valid_until: f.validUntil,
      subjectivities: f.subjectivities.split("\n").map((s) => s.trim()).filter(Boolean),
      ...(quote ? { change_reason: [f.reason, f.reasonNote.trim()].filter(Boolean).join(": ") } : {}),
    };
    try {
      if (quote) await api.patch(`/api/deals/${dealId}/quotes/${quote.id}`, body);
      else await api.post(`/api/deals/${dealId}/quotes`, { ...body, insurer_id: f.insurer });
      await onSaved();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel eyebrow={quote ? "Edit" : "New"} title={quote ? `Edit the ${quote.insurer_name} quote` : "Record an insurer quote"}>
      <form onSubmit={submit}>
        <div className="pl-inline-form">
          <div className="field"><label htmlFor="qt-ins">Insurer</label>
            <select id="qt-ins" value={f.insurer} onChange={set("insurer")} required disabled={Boolean(quote)}><option value="">Choose…</option>{options.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <div className="field"><label htmlFor="qt-ref">Quote reference</label><input id="qt-ref" value={f.reference} onChange={set("reference")} /></div>
          <div className="field"><label htmlFor="qt-cur">Currency</label>
            <select id="qt-cur" value={f.currency} onChange={set("currency")}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="qt-prem">Premium ({f.currency === "NGN" ? "₦" : f.currency})</label><input id="qt-prem" type="number" min="0" step="0.01" value={f.premium} onChange={set("premium")} required /></div>
          <div className="field"><label htmlFor="qt-rate">Commission (%)</label><input id="qt-rate" type="number" min="0" max="100" step="0.01" value={f.ratePct} onChange={set("ratePct")} /></div>
          <div className="field"><label htmlFor="qt-ded">Excess ({f.currency === "NGN" ? "₦" : f.currency})</label><input id="qt-ded" type="number" min="0" step="0.01" value={f.deductible} onChange={set("deductible")} /></div>
          <div className="field"><label htmlFor="qt-line">Line offered (%)</label><input id="qt-line" type="number" min="0.01" max="100" step="0.01" value={f.linePct} onChange={set("linePct")} /><span className="field-hint">100 unless the insurer takes only part of the risk</span></div>
          <div className="field"><label htmlFor="qt-valid">Valid until</label><input id="qt-valid" type="date" value={f.validUntil} onChange={set("validUntil")} /></div>
          <div className="field is-wide"><label htmlFor="qt-terms">Terms and conditions</label><textarea id="qt-terms" rows={2} value={f.terms} onChange={set("terms")} /></div>
          <div className="field is-wide"><label htmlFor="qt-excl">Exclusions (comma separated)</label><input id="qt-excl" value={f.exclusions} onChange={set("exclusions")} /></div>
          <div className="field is-wide"><label htmlFor="qt-lim">Covers and limits (one per line, “Name: amount”)</label><textarea id="qt-lim" rows={3} value={f.limits} onChange={set("limits")} placeholder={"Fire: 80000000\nBurglary: 5000000"} /></div>
          <div className="field is-wide"><label htmlFor="qt-subj">Subjectivities (one per line)</label><textarea id="qt-subj" rows={2} value={f.subjectivities} onChange={set("subjectivities")} placeholder="Conditions the insurer attaches, for example: satisfactory survey within 30 days" /></div>
          {quote && (
            <>
              <div className="field">
                <label htmlFor="qt-reason">Why it changed</label>
                <select id="qt-reason" value={f.reason} onChange={set("reason")}>
                  <option value="">Choose…</option>
                  {CHANGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="Other">Other</option>
                </select>
                <span className="field-hint">A change is saved as revision {(quote.revision ?? 1) + 1}; earlier versions are kept</span>
              </div>
              <div className="field is-wide"><label htmlFor="qt-reason-note">Details{f.reason === "Other" ? "" : " (optional)"}</label><input id="qt-reason-note" value={f.reasonNote} onChange={set("reasonNote")} required={f.reason === "Other"} /></div>
            </>
          )}
        </div>
        {error && <div className="flash flash-error">{error}</div>}
        <div className="pl-actions">
          <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save quote"}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Panel>
  );
}

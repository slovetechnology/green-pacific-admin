import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import { describeError, toFraction, toPercent, type CompareQuote, type CompareResponse } from "../../lib/types";
import { isClosed, type TabProps } from "./shared";

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
                    <tr key={q.id} className={q.isRecommended ? "is-recommended" : undefined}>
                      <td className="wrap"><b>{q.insurer_name}</b>{q.isRecommended && <span className="exec-best">Recommended</span>}{q.quote_reference && <div className="pl-hint">Ref {q.quote_reference}</div>}{q.terms && <div className="pl-hint">{q.terms}</div>}</td>
                      <td className="num">{fmtMoney(q.premium)}</td>
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
          <div className="field"><label htmlFor="qt-prem">Premium (₦)</label><input id="qt-prem" type="number" min="0" step="0.01" value={f.premium} onChange={set("premium")} required /></div>
          <div className="field"><label htmlFor="qt-rate">Commission (%)</label><input id="qt-rate" type="number" min="0" max="100" step="0.01" value={f.ratePct} onChange={set("ratePct")} /></div>
          <div className="field"><label htmlFor="qt-ded">Excess (₦)</label><input id="qt-ded" type="number" min="0" step="0.01" value={f.deductible} onChange={set("deductible")} /></div>
          <div className="field is-wide"><label htmlFor="qt-terms">Terms and conditions</label><textarea id="qt-terms" rows={2} value={f.terms} onChange={set("terms")} /></div>
          <div className="field is-wide"><label htmlFor="qt-excl">Exclusions (comma separated)</label><input id="qt-excl" value={f.exclusions} onChange={set("exclusions")} /></div>
          <div className="field is-wide"><label htmlFor="qt-lim">Covers and limits (one per line, “Name: amount”)</label><textarea id="qt-lim" rows={3} value={f.limits} onChange={set("limits")} placeholder={"Fire: 80000000\nBurglary: 5000000"} /></div>
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

import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { bpsText, errorText, minorDecimal, minorText, useReinsuranceStatus, type TreatyView } from "../lib/reinsurance";
import { promptDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/reinsurance.css";

interface Deficit { year: number; amount_minor: number }
interface SlidingResult { incurred_minor: number; loss_ratio_bps: number; band: { lr_from_bps: number; lr_to_bps: number | null }; commission_bps: number; provisional_bps: number; provisional_commission_minor: number; final_commission_minor: number; adjustment_minor: number }
interface ProfitResult { management_expense_minor: number; result_minor: number; deficits_used: Deficit[]; deficits_lapsed: Deficit[]; deficits_out: Deficit[]; profit_after_deficits_minor: number; share_bps: number; profit_commission_minor: number }
interface Preview {
  kind: string; currency: string; period_start: string; period_end: string; order_bps: number; order_item_minor: number; verify: string;
  result: SlidingResult & ProfitResult; reinsurers: { party_id: number; name: string; signed_bps: number; amount_minor: number }[];
}
interface Calc extends Preview {
  id: number; status: string; prepared_by: string; approved_by: string | null; decision_note: string | null; order_adjustment_minor: number; posted_account_ref: string | null; posted_account_id: number | null;
}
interface Suggest { currency: string; premium_minor: number | null; premium_source: string | null; paid_minor: number | null; outstanding_minor: number | null; losses_source: string | null; commission_minor?: number; commission_source?: string; brokerage_minor?: number; brokerage_source?: string; deficits?: Deficit[]; deficits_source?: string }
interface ReinstWhatIf { amount_minor: number; premium_minor: number; unreinstated_minor: number; premium_basis_minor: number; premium_basis_source: string; capacity_minor: number; room_after_minor: number; tranches: { reinstatement_no: number; amount_minor: number; premium_bps: number; basis: string; premium_minor: number }[]; time_factor: { remaining_days: number; period_days: number } | null }

const BASIS_NOTE = "Verify against the treaty wording. The scale, profit share, management expense and deficit carry-forward are the figures entered on the treaty, not market defaults.";

export function CalculatorsPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const treaty = useQuery({ queryKey: ["ri", "treaty", id], queryFn: () => api.get<TreatyView>(`/api/reinsurance/treaties/${id}`) });
  const calcs = useQuery({ queryKey: ["ri", "calcs", id], queryFn: () => api.get<{ calcs: Calc[] }>(`/api/reinsurance/treaties/${id}/commission-calcs`) });
  const accounts = useQuery({ queryKey: ["ri", "accounts", "draft", id], queryFn: () => api.get<{ rows: { id: number; account_ref: string; period_start: string; period_end: string; status: string }[] }>(`/api/reinsurance/treaty-accounts?treaty_id=${id}&status=Draft`) });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (treaty.isLoading) return <p>Loading…</p>;
  const t = treaty.data;
  if (treaty.error || !t) return <div className="flash flash-error">{errorText(treaty.error) || "Treaty not found."}</div>;
  const cur = t.treaty.currency;
  const commission = t.treaty.commission;
  const hasReinst = t.treaty.reinstatements.length > 0;
  return (
    <div>
      <div className="page-header"><div>
        <p className="eyebrow"><Link to="/reinsurance/treaties">Treaties</Link> · <Link to={`/reinsurance/treaties/${t.treaty.id}`}>{t.treaty.treaty_ref}</Link></p>
        <h1>Calculators</h1><p className="ri-note">{t.treaty.name} · {t.treaty.treaty_type} · {t.treaty.period_start} to {t.treaty.period_end} · {cur}</p></div></div>
      <div className="flash flash-info">{BASIS_NOTE}</div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}

      {hasReinst && <ReinstatementWhatIf treatyId={t.treaty.id} layers={t.layers} cur={cur} />}
      {commission.type === "sliding" && commission.sliding
        ? <CommissionCalc kind="sliding-scale" label="Sliding-scale commission" treatyId={t.treaty.id} cur={cur} run={run} canPrepare={can("ri.accounts.post")} terms={<p className="ri-note">Scale: provisional {bpsText(commission.sliding.provisional_bps)}, held between {bpsText(commission.sliding.min_bps)} and {bpsText(commission.sliding.max_bps)}. {commission.sliding.bands.map((b) => `${bpsText(b.lr_from_bps)}–${b.lr_to_bps === null ? "and over" : bpsText(b.lr_to_bps)} → ${bpsText(b.commission_bps)}`).join("; ")}.</p>} />
        : <div className="card"><h2>Sliding-scale commission</h2><p className="ri-note">This treaty has no sliding scale on record. Add one to its commission terms to use this calculator.</p></div>}
      {commission.profit
        ? <CommissionCalc kind="profit-commission" label="Profit commission" treatyId={t.treaty.id} cur={cur} run={run} canPrepare={can("ri.accounts.post")} terms={<p className="ri-note">Profit share {bpsText(commission.profit.share_bps)}, management expense {bpsText(commission.profit.management_expense_bps)} of premium, deficits carried {commission.profit.deficit_carry_forward_years} year(s).</p>} />
        : <div className="card"><h2>Profit commission</h2><p className="ri-note">This treaty has no profit commission on record. Add one to its commission terms to use this calculator.</p></div>}

      <div className="card"><h2>Saved calculations</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Calculation</th><th>Period</th><th className="ri-num">Result</th><th className="ri-num">Effect on the treaty account (our order)</th><th>Status</th><th /></tr></thead>
          <tbody>{!calcs.data?.calcs.length && <tr><td colSpan={6}>None yet.</td></tr>}
            {calcs.data?.calcs.map((c) => (
              <tr key={c.id}><td>{c.kind}<div className="ri-note">Prepared by {c.prepared_by}{c.approved_by ? `, decided by ${c.approved_by}` : ""}{c.decision_note ? ` · ${c.decision_note}` : ""}</div></td>
                <td>{c.period_start} to {c.period_end}</td>
                <td className="ri-num">{c.kind === "Sliding scale" ? `${bpsText(c.result.commission_bps)} at LR ${bpsText(c.result.loss_ratio_bps)}` : minorText(c.result.profit_commission_minor, cur)}</td>
                <td className="ri-num">{minorText(c.order_adjustment_minor, cur)}<div className="ri-note">{c.order_adjustment_minor < 0 ? "payable to the cedant" : c.order_adjustment_minor > 0 ? "returned by the cedant" : "no adjustment"}</div></td>
                <td><StatusBadge status={c.status} />{c.posted_account_ref && <div className="ri-note">in {c.posted_account_ref}</div>}</td>
                <td>
                  {c.status === "Draft" && can("ri.calc.approve") && <>
                    <button type="button" className="btn btn-sm" onClick={() => run("Approved.", () => api.post(`/api/reinsurance/commission-calcs/${c.id}/decide`, { approve: true }))}>Approve</button>{" "}
                    <button type="button" className="btn-secondary btn btn-sm" onClick={async () => { const note = await promptDialog({ message: "Why is this being rejected?", required: true, multiline: true }); if (note) run("Rejected.", () => api.post(`/api/reinsurance/commission-calcs/${c.id}/decide`, { approve: false, note })); }}>Reject</button>{" "}</>}
                  {c.status === "Draft" && can("ri.accounts.post") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Withdrawn.", () => api.post(`/api/reinsurance/commission-calcs/${c.id}/withdraw`))}>Withdraw</button>}
                  {c.status === "Approved" && !c.posted_account_ref && can("ri.accounts.post") && c.order_adjustment_minor !== 0 && accounts.data?.rows.length ? (
                    <select aria-label="Post to a draft treaty account" defaultValue="" onChange={(e) => { if (e.target.value) run("Posted to the treaty account.", () => api.post(`/api/reinsurance/commission-calcs/${c.id}/post`, { account_id: Number(e.target.value) })); }}>
                      <option value="">Post to account…</option>{accounts.data.rows.map((a) => <option key={a.id} value={a.id}>{a.account_ref} ({a.period_start} to {a.period_end})</option>)}</select>) : null}
                  {c.status === "Approved" && !c.posted_account_ref && can("ri.calc.approve") && <button type="button" className="btn-secondary btn btn-sm" onClick={async () => { const reason = await promptDialog({ message: "Why is this approved calculation being voided?", required: true, multiline: true }); if (reason) run("Voided.", () => api.post(`/api/reinsurance/commission-calcs/${c.id}/void`, { reason })); }}>Void</button>}
                </td></tr>))}</tbody></table></div>
        <p className="ri-note">A calculation is frozen when saved, and a different person approves it. Once approved it can be posted to a draft treaty account as an adjustment, which is shared across the reinsurers by their signed lines. Treaty accounts must be open (Draft) to receive it.</p>
      </div>
    </div>
  );
}

function ReinstatementWhatIf({ treatyId, layers, cur }: { treatyId: number; layers: { id: number; layer_no: number; description: string | null }[]; cur: string }) {
  const [f, setF] = useState({ layer_id: layers.length === 1 ? String(layers[0].id) : "", loss: "", loss_date: "", premium_basis: "", prior_reinstated: "" });
  const [out, setOut] = useState<ReinstWhatIf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function go(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { setOut(await api.post<ReinstWhatIf>(`/api/reinsurance/treaties/${treatyId}/reinstatement-whatif`, { ...f, layer_id: f.layer_id ? Number(f.layer_id) : undefined, loss_date: f.loss_date || undefined, premium_basis: f.premium_basis || undefined, prior_reinstated: f.prior_reinstated || undefined })); }
    catch (err) { setOut(null); setError(errorText(err)); }
  }
  return (
    <div className="card"><h2>Reinstatement premium (what if)</h2>
      <form onSubmit={go}>
        <div className="ri-inline">
          {layers.length > 0 && <div className="field"><label htmlFor="w-layer">Layer</label><select id="w-layer" value={f.layer_id} onChange={set("layer_id")} required><option value="">Choose…</option>{layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}{l.description ? ` · ${l.description}` : ""}</option>)}</select></div>}
          <div className="field"><label htmlFor="w-loss">Loss to the layer ({cur})</label><input id="w-loss" inputMode="decimal" value={f.loss} onChange={set("loss")} required /></div>
          <div className="field"><label htmlFor="w-date">Date of loss</label><input id="w-date" type="date" value={f.loss_date} onChange={set("loss_date")} /></div>
          <div className="field"><label htmlFor="w-prem">Premium basis (optional)</label><input id="w-prem" inputMode="decimal" value={f.premium_basis} onChange={set("premium_basis")} /></div>
          <div className="field"><label htmlFor="w-prior">Already reinstated (optional)</label><input id="w-prior" inputMode="decimal" value={f.prior_reinstated} onChange={set("prior_reinstated")} /></div>
          <button className="btn btn-sm" type="submit">Calculate</button>
        </div>
      </form>
      {error && <div className="flash flash-error">{error}</div>}
      {out && (<div>
        <p>Restores <strong>{minorText(out.amount_minor, cur)}</strong>; premium <strong>{minorText(out.premium_minor, cur)}</strong> at 100% (on {minorText(out.premium_basis_minor, cur)}, {out.premium_basis_source.toLowerCase()}). Reinstatement left afterwards: {minorText(out.room_after_minor, cur)}.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinstatement</th><th className="ri-num">Amount</th><th className="ri-num">Rate</th><th>Basis</th><th className="ri-num">Premium</th></tr></thead>
          <tbody>{out.tranches.map((t) => <tr key={t.reinstatement_no}><td>{t.reinstatement_no}</td><td className="ri-num">{minorText(t.amount_minor, cur)}</td><td className="ri-num">{bpsText(t.premium_bps)}</td><td>{t.basis.replace(/_/g, " ")}</td><td className="ri-num">{minorText(t.premium_minor, cur)}</td></tr>)}</tbody></table></div>
        {out.time_factor && <p className="ri-note">Time factor {out.time_factor.remaining_days} of {out.time_factor.period_days} days.</p>}
        {out.unreinstated_minor > 0 && <p className="ri-note">{minorText(out.unreinstated_minor, cur)} is beyond the reinstatements available and restores no limit.</p>}
        <p className="ri-note">Nothing is saved from here. Calculate and bill from the claim itself.</p></div>)}
    </div>
  );
}

function CommissionCalc({ kind, label, treatyId, cur, run, canPrepare, terms }: { kind: "sliding-scale" | "profit-commission"; label: string; treatyId: number; cur: string; run: (done: string, fn: () => Promise<unknown>) => Promise<void>; canPrepare: boolean; terms: React.ReactNode }) {
  const profit = kind === "profit-commission";
  const year = String(new Date().getFullYear());
  const [f, setF] = useState({ period_start: `${year}-01-01`, period_end: `${year}-12-31`, premium: "", commission: "", brokerage: "", paid: "", outstanding: "" });
  const [deficits, setDeficits] = useState<{ year: string; amount: string }[]>([]);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const body = () => ({ ...f, ...(profit ? { deficits: deficits.filter((d) => d.year && d.amount) } : {}) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setPrev(null); };
  async function suggest() {
    setError(null);
    try {
      const s = await api.get<Suggest>(`/api/reinsurance/treaties/${treatyId}/commission-calcs/${kind}/suggest?period_start=${f.period_start}&period_end=${f.period_end}`);
      setF({ ...f, premium: minorDecimal(s.premium_minor) || f.premium, paid: minorDecimal(s.paid_minor) || f.paid, outstanding: minorDecimal(s.outstanding_minor) || f.outstanding,
        ...(profit ? { commission: minorDecimal(s.commission_minor) || f.commission, brokerage: minorDecimal(s.brokerage_minor) || f.brokerage } : {}) });
      if (profit && s.deficits) setDeficits(s.deficits.map((d) => ({ year: String(d.year), amount: minorDecimal(d.amount_minor) })));
      setSources([s.premium_source, s.losses_source, s.commission_source, s.brokerage_source, s.deficits_source].filter((x): x is string => Boolean(x)));
      if (s.premium_minor === null) setSources(["No accepted bordereaux fall in this period, so nothing was filled in. Enter the figures by hand."]);
    } catch (e) { setError(errorText(e)); }
  }
  async function calculate(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try { setPrev(await api.post<Preview>(`/api/reinsurance/treaties/${treatyId}/commission-calcs/${kind}/preview`, body())); } catch (err) { setPrev(null); setError(errorText(err)); }
  }
  const r = prev?.result;
  return (
    <div className="card"><h2>{label}</h2>{terms}
      <form onSubmit={calculate}>
        <div className="ri-inline">
          <div className="field"><label htmlFor={`${kind}-s`}>Period from</label><input id={`${kind}-s`} type="date" value={f.period_start} onChange={set("period_start")} required /></div>
          <div className="field"><label htmlFor={`${kind}-e`}>to</label><input id={`${kind}-e`} type="date" value={f.period_end} onChange={set("period_end")} required /></div>
          <button type="button" className="btn-secondary btn btn-sm" onClick={suggest}>Fill from accepted bordereaux</button>
        </div>
        {sources.length > 0 && <ul className="ri-note">{sources.map((s) => <li key={s}>{s}</li>)}</ul>}
        <div className="ri-inline">
          <div className="field"><label htmlFor={`${kind}-p`}>Premium ({cur}, 100%)</label><input id={`${kind}-p`} inputMode="decimal" value={f.premium} onChange={set("premium")} required /></div>
          {profit && <div className="field"><label htmlFor={`${kind}-c`}>Commission</label><input id={`${kind}-c`} inputMode="decimal" value={f.commission} onChange={set("commission")} required /></div>}
          {profit && <div className="field"><label htmlFor={`${kind}-b`}>Brokerage</label><input id={`${kind}-b`} inputMode="decimal" value={f.brokerage} onChange={set("brokerage")} /></div>}
          <div className="field"><label htmlFor={`${kind}-l`}>Paid losses</label><input id={`${kind}-l`} inputMode="decimal" value={f.paid} onChange={set("paid")} required /></div>
          <div className="field"><label htmlFor={`${kind}-o`}>Outstanding reserves</label><input id={`${kind}-o`} inputMode="decimal" value={f.outstanding} onChange={set("outstanding")} /></div>
        </div>
        {profit && (
          <div><h3>Deficits brought forward</h3>
            {deficits.map((d, i) => (
              <div className="ri-inline" key={i}>
                <div className="field"><label htmlFor={`d-y-${i}`}>Year</label><input id={`d-y-${i}`} inputMode="numeric" value={d.year} onChange={(e) => { const n = [...deficits]; n[i] = { ...d, year: e.target.value }; setDeficits(n); setPrev(null); }} /></div>
                <div className="field"><label htmlFor={`d-a-${i}`}>Amount ({cur})</label><input id={`d-a-${i}`} inputMode="decimal" value={d.amount} onChange={(e) => { const n = [...deficits]; n[i] = { ...d, amount: e.target.value }; setDeficits(n); setPrev(null); }} /></div>
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setDeficits(deficits.filter((_, j) => j !== i)); setPrev(null); }}>Remove</button>
              </div>))}
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setDeficits([...deficits, { year: "", amount: "" }])}>Add a deficit</button></div>)}
        <p><button className="btn btn-sm" type="submit">Calculate</button></p>
      </form>
      {error && <div className="flash flash-error">{error}</div>}
      {prev && r && (
        <div>
          {!profit ? (
            <p>Loss ratio <strong>{bpsText(r.loss_ratio_bps)}</strong> on incurred {minorText(r.incurred_minor, cur)} puts the commission at <strong>{bpsText(r.commission_bps)}</strong> ({minorText(r.final_commission_minor, cur)}) against {bpsText(r.provisional_bps)} provisional ({minorText(r.provisional_commission_minor, cur)}). Adjustment <strong>{minorText(r.adjustment_minor, cur)}</strong> {r.adjustment_minor > 0 ? "more commission to the cedant" : r.adjustment_minor < 0 ? "commission returned by the cedant" : ""}.</p>
          ) : (
            <div>
              <p>Result after commission, brokerage, losses and {minorText(r.management_expense_minor, cur)} management expense: <strong>{minorText(r.result_minor, cur)}</strong>. After earlier deficits: {minorText(r.profit_after_deficits_minor, cur)}. Profit commission at {bpsText(r.share_bps)}: <strong>{minorText(r.profit_commission_minor, cur)}</strong>.</p>
              {r.deficits_used.length > 0 && <p className="ri-note">Deficits set off: {r.deficits_used.map((d) => `${d.year}: ${minorText(d.amount_minor, cur)}`).join("; ")}.</p>}
              {r.deficits_lapsed.length > 0 && <p className="flash flash-warning">Not used, outside the carry-forward period: {r.deficits_lapsed.map((d) => `${d.year}: ${minorText(d.amount_minor, cur)}`).join("; ")}.</p>}
              {r.deficits_out.length > 0 && <p className="ri-note">Deficits to carry forward: {r.deficits_out.map((d) => `${d.year}: ${minorText(d.amount_minor, cur)}`).join("; ")}.</p>}
            </div>)}
          <p>At our {bpsText(prev.order_bps)} order the treaty account changes by <strong>{minorText(prev.order_item_minor, cur)}</strong> ({prev.order_item_minor < 0 ? "payable to the cedant" : prev.order_item_minor > 0 ? "returned by the cedant" : "no change"}):
            {" "}{prev.reinsurers.map((x) => `${x.name} ${minorText(x.amount_minor, cur)}`).join("; ")}.</p>
          {canPrepare && <button type="button" className="btn btn-sm" onClick={() => run("Saved for approval.", () => api.post(`/api/reinsurance/treaties/${treatyId}/commission-calcs/${kind}`, body()).then(() => setPrev(null)))}>Save for approval</button>}
        </div>)}
    </div>
  );
}

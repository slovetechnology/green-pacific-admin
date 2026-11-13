import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { Party, Reinstatement } from "../lib/reinsurance";
import type { TermsState } from "../lib/treatyTerms";

const PROPORTIONAL = ["Quota Share", "Surplus", "Fac Obligatory"];

// The treaty's terms. `creating` adds the fields that can't change later (cedant, currency).
export function TreatyTermsForm({ state, setState, creating, onSubmit, onCancel, busy, submitLabel }: {
  state: TermsState; setState: (s: TermsState) => void; creating: boolean; onSubmit: () => void; onCancel?: () => void; busy: boolean; submitLabel: string;
}) {
  const cedants = useQuery({ queryKey: ["ri", "cedants"], queryFn: () => api.get<{ rows: Party[] }>("/api/reinsurance/parties?type=Cedant&limit=200"), enabled: creating });
  const meta = useQuery({
    queryKey: ["ri", "treaty-meta"],
    queryFn: () => api.get<{ types: string[]; bases: string[]; reinstatementBases: string[]; brokerageDeductedFrom: string[] }>("/api/reinsurance/treaty-meta"),
  });
  const set = <K extends keyof TermsState>(k: K, value: TermsState[K]) => setState({ ...state, [k]: value });
  const text = (k: keyof TermsState, label: string, opts: { type?: string; hint?: string; span?: string } = {}) => (
    <div className={`field${opts.span ? ` ${opts.span}` : ""}`}>
      <label htmlFor={`t-${k}`}>{label}</label>
      <input id={`t-${k}`} type={opts.type || "text"} value={state[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      {opts.hint && <small className="muted">{opts.hint}</small>}
    </div>
  );
  const proportional = PROPORTIONAL.includes(state.treaty_type);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} noValidate>
      <div className="card">
        <h2>Contract</h2>
        <div className="form-grid">
          {text("name", "Treaty name", { span: "span-2" })}
          {creating && (
            <div className="field"><label htmlFor="t-cedant">Cedant</label>
              <select id="t-cedant" value={state.cedant_party_id} onChange={(e) => set("cedant_party_id", e.target.value)}><option value="">Choose…</option>
                {(cedants.data?.rows ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          )}
          <div className="field"><label htmlFor="t-type">Type</label>
            <select id="t-type" value={state.treaty_type} onChange={(e) => set("treaty_type", e.target.value)}>{(meta.data?.types ?? [state.treaty_type]).map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="t-basis">Basis</label>
            <select id="t-basis" value={state.basis} onChange={(e) => set("basis", e.target.value)}>{(meta.data?.bases ?? [state.basis]).map((t) => <option key={t}>{t}</option>)}</select></div>
          {text("period_start", "Period start", { type: "date" })}
          {text("period_end", "Period end", { type: "date" })}
          {text("treaty_year", "Treaty year", { hint: "Defaults to the start year" })}
          {creating && <div className="field"><label htmlFor="t-cur">Currency</label>
            <select id="t-cur" value={state.currency} onChange={(e) => set("currency", e.target.value)}>{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div>}
          {text("class_of_business", "Class of business")}
          {text("sub_classes", "Sub-classes", { hint: "Comma separated" })}
          {text("territorial_scope", "Territorial scope")}
          {text("original_inception_scope", "Original inception scope")}
        </div>
      </div>

      <div className="card">
        <h2>Capacity and premium</h2>
        <div className="form-grid">
          {text("retention", "Retention", { hint: "Cedant's retention" })}
          {text("limit", "Limit")}
          {state.treaty_type === "Surplus" && text("lines_count", "Number of lines")}
          {proportional && text("cession", "Cession (%)")}
          {proportional && text("ceding_commission", "Ceding commission (%)")}
          {text("brokerage", "Brokerage (%)")}
          <div className="field"><label htmlFor="t-ded">Brokerage deducted from</label>
            <select id="t-ded" value={state.brokerage_deducted_from} onChange={(e) => set("brokerage_deducted_from", e.target.value)}><option value="">Not stated</option>
              {(meta.data?.brokerageDeductedFrom ?? ["Reinsurer", "Cedant"]).map((t) => <option key={t}>{t}</option>)}</select></div>
          {text("epi", "Estimated premium income")}
          {text("mdp", "Minimum and deposit premium")}
          {text("min_premium", "Minimum premium")}
          {text("rate_on_spi", "Rate on subject premium (%)")}
          {text("premium_payment_warranty_days", "Premium payment warranty (days)")}
          <div className="field"><label htmlFor="t-npnc"><input id="t-npnc" type="checkbox" checked={state.no_premium_no_cover} onChange={(e) => set("no_premium_no_cover", e.target.checked)} /> No premium, no cover</label>
            <small className="muted">Applies after the days allowed. A warranty clause, not a rule this system enforces yet.</small></div>
        </div>
      </div>

      <div className="card">
        <h2>Commission</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="t-ctype">Commission basis</label>
            <select id="t-ctype" value={state.commissionType} onChange={(e) => set("commissionType", e.target.value as TermsState["commissionType"])}>
              <option value="none">None / ceding commission above</option><option value="flat">Flat</option><option value="sliding">Sliding scale</option></select></div>
          {state.commissionType === "flat" && text("flatRate", "Flat commission (%)")}
          {state.commissionType === "sliding" && <>{text("provisional", "Provisional (%)")}{text("minC", "Minimum (%)")}{text("maxC", "Maximum (%)")}</>}
        </div>
        {state.commissionType === "sliding" && (
          <>
            <p className="ri-note">Loss-ratio bands run from 0% with no gaps. Leave the last band's end empty for "and above".</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Loss ratio from (%)</th><th>to (%)</th><th>Commission (%)</th><th /></tr></thead>
              <tbody>{state.bands.map((b, i) => (
                <tr key={i}>
                  <td><input aria-label={`Band ${i + 1} from`} value={b.from} onChange={(e) => set("bands", state.bands.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /></td>
                  <td><input aria-label={`Band ${i + 1} to`} value={b.to} onChange={(e) => set("bands", state.bands.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} /></td>
                  <td><input aria-label={`Band ${i + 1} commission`} value={b.commission} onChange={(e) => set("bands", state.bands.map((x, j) => (j === i ? { ...x, commission: e.target.value } : x)))} /></td>
                  <td><button type="button" className="btn-secondary btn btn-sm" disabled={state.bands.length < 2} onClick={() => set("bands", state.bands.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>))}</tbody></table></div>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => set("bands", [...state.bands, { from: state.bands.at(-1)?.to || "", to: "", commission: "" }])}>Add band</button>
          </>
        )}
        <div className="field" style={{ marginTop: "0.75rem" }}><label htmlFor="t-profit"><input id="t-profit" type="checkbox" checked={state.profit} onChange={(e) => set("profit", e.target.checked)} /> Profit commission</label></div>
        {state.profit && <div className="form-grid">{text("profitShare", "Share of profit (%)")}{text("mgmtExpense", "Management expense (%)")}{text("carryYears", "Deficit carried forward (years)")}</div>}
      </div>

      <div className="card">
        <h2>Reinstatements</h2>
        {!state.reinstatements.length && <p className="ri-note">None. Add one for each reinstatement the treaty gives, with its additional premium.</p>}
        {state.reinstatements.map((r, i) => (
          <div className="ri-inline" key={i}>
            <div className="field"><label htmlFor={`r-p-${i}`}>Reinstatement {i + 1}: additional premium (%)</label>
              <input id={`r-p-${i}`} value={r.premium} onChange={(e) => set("reinstatements", state.reinstatements.map((x, j) => (j === i ? { ...x, premium: e.target.value } : x)))} /></div>
            <div className="field"><label htmlFor={`r-b-${i}`}>Basis</label>
              <select id={`r-b-${i}`} value={r.basis} onChange={(e) => set("reinstatements", state.reinstatements.map((x, j) => (j === i ? { ...x, basis: e.target.value as Reinstatement["basis"] } : x)))}>
                {(meta.data?.reinstatementBases ?? ["pro_rata_amount", "pro_rata_time_amount", "flat"]).map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}</select></div>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => set("reinstatements", state.reinstatements.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn btn-sm" onClick={() => set("reinstatements", [...state.reinstatements, { premium: "100", basis: "pro_rata_amount" }])}>Add reinstatement</button>
      </div>

      <div className="card">
        <h2>Conditions</h2>
        <div className="form-grid">
          <div className="field span-2"><label htmlFor="t-excl">Exclusions</label><textarea id="t-excl" rows={3} value={state.exclusions} onChange={(e) => set("exclusions", e.target.value)} /></div>
          <div className="field span-2"><label htmlFor="t-special">Special conditions (claims cooperation, cash call, and so on)</label><textarea id="t-special" rows={3} value={state.special_conditions} onChange={(e) => set("special_conditions", e.target.value)} /></div>
        </div>
      </div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>{" "}
      {onCancel && <button className="btn-secondary btn" type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { QuestionnairePanel } from "@/features/sales/risk-discovery/components/QuestionnairePanel";
import { GateNotice } from "../GateNotice";
import { describeError, missingOf, type GateItem } from "../../lib/types";
import { marketsKey, marketsUrl, type DealMarkets } from "../../lib/markets";
import { isClosed, type TabProps } from "./shared";

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

interface SendResult {
  slip: { id: number; slip_number: string };
  warnings: string[];
  deal: { stage: string };
  moveError: { message: string; missing: GateItem[] } | null;
}

export function RiskTab(props: TabProps) {
  const { detail } = props;
  return (
    <div role="tabpanel" id="deal-panel-risk" aria-labelledby="deal-tab-risk" tabIndex={0} className="exec-tabpanel">
      <RiskForm {...props} />
      <QuestionnairePanel dealId={detail.deal.id} canWrite={props.canWrite} onChanged={() => { void props.refresh(); }} />
      <SlipPanel {...props} />
      <p className="pl-hint">Clauses for {detail.deal.class_of_business || "this class"} are attached to the slip automatically from the clause library.</p>
    </div>
  );
}

function RiskForm({ detail, options, canWrite, refresh }: TabProps) {
  const { deal } = detail;
  const closed = isClosed(detail);
  const risk = parseJson<Record<string, unknown>>(deal.risk_details_json, {});
  const targets = parseJson<number[]>(deal.target_insurer_ids_json, []);
  const isMotor = /motor|vehicle|motorcycle/i.test(deal.class_of_business ?? "");
  const [f, setF] = useState({
    subject: deal.subject_matter ?? "", sum: String(deal.sum_insured || ""), start: deal.period_start ?? "", end: deal.period_end ?? "",
    deductible: String(deal.deductible || ""), premium: String(deal.estimated_premium || ""), tppd: risk.tppd_limit !== undefined ? String(risk.tppd_limit) : "",
  });
  const [chosen, setChosen] = useState<number[]>(targets);
  // Insurers already sent the slip stay on the deal (their history is on the Markets tab).
  const { data: markets } = useQuery({ queryKey: marketsKey(deal.id), queryFn: () => api.get<DealMarkets>(marketsUrl(deal.id)) });
  const approached = new Set((markets?.markets ?? []).filter((m) => m.status !== "Draft").map((m) => m.insurer_id));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; missing: GateItem[] } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };
  const disabled = !canWrite || closed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const nextRisk = { ...risk };
    if (isMotor) {
      if (f.tppd) nextRisk.tppd_limit = Number(f.tppd);
      else delete nextRisk.tppd_limit;
    }
    try {
      await api.patch(`/api/deals/${deal.id}`, {
        subject_matter: f.subject, sum_insured: f.sum, period_start: f.start, period_end: f.end, deductible: f.deductible,
        estimated_premium: f.premium, target_insurer_ids: chosen, risk_details: nextRisk,
      });
      setSaved(true);
      await refresh();
    } catch (err) {
      setError({ message: describeError(err), missing: missingOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel eyebrow="Risk information" title="What is being insured">
      <form onSubmit={submit}>
        <div className="pl-inline-form">
          <div className="field is-wide"><label htmlFor="rk-subject">Subject matter</label><textarea id="rk-subject" rows={2} value={f.subject} onChange={set("subject")} disabled={disabled} placeholder="What is being insured, where, and how it is used" /></div>
          <div className="field"><label htmlFor="rk-sum">Sum insured (₦)</label><input id="rk-sum" type="number" min="0" step="0.01" value={f.sum} onChange={set("sum")} disabled={disabled} /></div>
          <div className="field"><label htmlFor="rk-prem">Estimated premium (₦)</label><input id="rk-prem" type="number" min="0" step="0.01" value={f.premium} onChange={set("premium")} disabled={disabled} /></div>
          <div className="field"><label htmlFor="rk-start">Period starts</label><input id="rk-start" type="date" value={f.start} onChange={set("start")} disabled={disabled} /></div>
          <div className="field"><label htmlFor="rk-end">Period ends</label><input id="rk-end" type="date" value={f.end} onChange={set("end")} disabled={disabled} /></div>
          <div className="field"><label htmlFor="rk-ded">Deductible / excess (₦)</label><input id="rk-ded" type="number" min="0" step="0.01" value={f.deductible} onChange={set("deductible")} disabled={disabled} /></div>
          {isMotor && <div className="field"><label htmlFor="rk-tppd">Third-party property damage limit (₦)</label><input id="rk-tppd" type="number" min="0" value={f.tppd} onChange={set("tppd")} disabled={disabled} /></div>}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.8rem" }} disabled={disabled}>
          <legend className="exec-sub">Insurers to approach</legend>
          <div className="pl-actions">
            {options?.insurers.map((i) => (
              <label key={i.id} className="pl-check" title={approached.has(i.id) ? "Already approached: see the Markets tab" : undefined}>
                <input type="checkbox" checked={chosen.includes(i.id) || approached.has(i.id)} disabled={approached.has(i.id)} onChange={(e) => { setChosen(e.target.checked ? [...chosen, i.id] : chosen.filter((x) => x !== i.id)); setSaved(false); }} /> {i.name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <GateNotice message={error.message} items={error.missing} dealId={deal.id} tone="crit" />}
        {!disabled && (
          <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save risk details"}</button>
            {saved && <span className="pl-hint" role="status">Saved.</span>}
          </div>
        )}
      </form>
    </Panel>
  );
}

function SlipPanel({ detail, canWrite, refresh, goTo }: TabProps) {
  const { deal } = detail;
  const [type, setType] = useState(deal.deal_type === "Renewal" ? "RENEWAL" : "NEW_BUSINESS");
  const [advance, setAdvance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSend = canWrite && !isClosed(detail) && deal.stage !== "Lead";

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<SendResult>(`/api/deals/${deal.id}/slip`, { slip_type: type, advance }));
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      eyebrow="Market"
      title="Broking slips"
      actions={canSend ? (
        <div className="pl-actions">
          <select aria-label="Slip type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="NEW_BUSINESS">New business slip</option>
            <option value="QUOTATION_REQUEST">Quotation request</option>
            <option value="RENEWAL">Renewal slip</option>
          </select>
          {deal.stage === "Qualified" && <label className="pl-check"><input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} /> Move to In Market</label>}
          <button type="button" className="btn btn-sm" onClick={send} disabled={busy}>{busy ? "Creating…" : "Send to market"}</button>
        </div>
      ) : undefined}
    >
      {deal.stage === "Lead" && <p className="pl-hint">Qualify the deal first. The slip is prepared from the risk details above.</p>}
      {error && <div className="flash flash-error">{error}</div>}
      {result && (
        <div className="pl-notice is-good" role="status" style={{ marginBottom: "0.7rem" }}>
          <h3>Slip {result.slip.slip_number} created</h3>
          <p style={{ margin: "0 0 0.3rem" }}>Now send it to each insurer and track their answers. <button type="button" className="btn-link" onClick={() => goTo("markets")}>Open the Markets tab</button></p>
          {result.warnings.length > 0 && <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {result.moveError && <GateNotice title="The deal stays at Qualified" message={result.moveError.missing.length ? undefined : result.moveError.message} items={result.moveError.missing} dealId={deal.id} />}
        </div>
      )}
      {detail.slips.length === 0 ? (
        <p className="pl-hint" style={{ margin: 0 }}>No slip yet. “Send to market” prepares one from the details on this page.</p>
      ) : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Slip</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {detail.slips.map((s) => (
                <tr key={s.id}><td><Link to={`/broking-slips/${s.id}`}>{s.slip_number}</Link></td><td>{s.slip_type.replace(/_/g, " ").toLowerCase()}</td><td><StatusBadge status={s.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


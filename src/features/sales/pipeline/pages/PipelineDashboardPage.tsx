import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import { dealLink, type FormOptions } from "../lib/types";

interface Dashboard {
  period: { from: string; to: string };
  staleDays: number;
  cached: boolean;
  totals: {
    openCount: number; openPremium: number; expectedBrokerage: number; expectedThisQuarter: number;
    wonCount: number; lostCount: number; wonPremium: number; wonBrokerage: number;
    winRatePct: number | null; avgCycleDays: number | null; atRiskCount: number;
  };
  byStage: { stage: string; count: number; premium: number; expectedBrokerage: number }[];
  conversion: { from: string; to: string; entered: number; reached: number; ratePct: number | null }[];
  timeInStage: { stage: string; avgDays: number | null; samples: number }[];
  atRisk: { id: number; dealName: string; clientName: string; stage: string; premium: number; owner: string | null; expiry: string | null; reasons: string[] }[];
  leaderboard: { ownerId: number | null; owner: string; won: number; lost: number; wonPremium: number; wonBrokerage: number; winRatePct: number | null; open: number; openExpected: number }[];
  lostReasons: { reason: string; count: number }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// The date ranges people actually ask for.
function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) * 3;
  switch (preset) {
    case "last-quarter": return { from: iso(new Date(Date.UTC(y, q - 3, 1))), to: iso(new Date(Date.UTC(y, q, 0))) };
    case "ytd": return { from: `${y}-01-01`, to: today };
    case "90": return { from: iso(new Date(now.getTime() - 90 * 86400000)), to: today };
    case "12m": return { from: iso(new Date(now.getTime() - 365 * 86400000)), to: today };
    default: return { from: iso(new Date(Date.UTC(y, q, 1))), to: today };
  }
}

const PRESETS: [string, string][] = [["quarter", "This quarter"], ["last-quarter", "Last quarter"], ["ytd", "Year to date"], ["90", "Last 90 days"], ["12m", "Last 12 months"]];

export function PipelineDashboardPage() {
  const [params, setParams] = useSearchParams();
  const preset = params.get("preset") ?? (params.get("from") ? "custom" : "quarter");
  const range = preset === "custom" ? { from: params.get("from") ?? presetRange("quarter").from, to: params.get("to") ?? presetRange("quarter").to } : presetRange(preset);
  const owner = params.get("owner") ?? "";

  const query = new URLSearchParams({ from: range.from, to: range.to });
  if (owner) query.set("owner", owner);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["deals", "dashboard", query.toString()], queryFn: () => api.get<Dashboard>(`/api/deals/dashboard?${query}`) });
  const { data: options } = useQuery({ queryKey: ["deals", "form-options"], queryFn: () => api.get<FormOptions>("/api/deals/meta/form-options") });

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const t = data?.totals;
  const metrics: Metric[] = t ? [
    { key: "open", label: "Open pipeline", value: fmtMoneyShort(t.openPremium), title: fmtMoney(t.openPremium), note: `${t.openCount} open deals` },
    { key: "expected", label: "Expected brokerage", value: fmtMoneyShort(t.expectedBrokerage), title: fmtMoney(t.expectedBrokerage), tone: "good", note: `${fmtMoneyShort(t.expectedThisQuarter)} due to close by quarter end` },
    { key: "won", label: "Won in period", value: fmtMoneyShort(t.wonBrokerage), title: fmtMoney(t.wonBrokerage), tone: "good", note: `${t.wonCount} deals, ${fmtMoneyShort(t.wonPremium)} premium` },
    { key: "rate", label: "Win rate", value: t.winRatePct === null ? "—" : fmtPct(t.winRatePct, 0), note: `${t.wonCount} won, ${t.lostCount} lost` },
    { key: "cycle", label: "Average sales cycle", value: t.avgCycleDays === null ? "—" : `${Math.round(t.avgCycleDays)} days`, note: "Created to won" },
    { key: "risk", label: "Deals at risk", value: t.atRiskCount, tone: t.atRiskCount ? "warn" : "neutral", note: `Stale ${data?.staleDays}d+, expiring or overdue` },
  ] : [];
  const maxExpected = Math.max(1, ...(data?.byStage.map((s) => s.expectedBrokerage) ?? [1]));

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Sales &amp; Pipeline</span>
          <h1>Pipeline dashboard</h1>
        </div>
        <div className="exec-header-actions">
          <Link className="btn btn-outline btn-sm" to="/deals">Pipeline board</Link>
          <Link className="btn btn-outline btn-sm" to="/crm/bd-kpis">Pipeline KPIs</Link>
          <Link className="btn btn-outline btn-sm" to="/crm/attribution">Attribution</Link>
        </div>
      </header>

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Dashboard period">
        <label className="exec-filter">
          <span>Period</span>
          <select value={preset} onChange={(e) => { const next = new URLSearchParams(params); next.delete("from"); next.delete("to"); if (e.target.value === "quarter") next.delete("preset"); else next.set("preset", e.target.value); if (e.target.value === "custom") { next.set("from", range.from); next.set("to", range.to); } setParams(next, { replace: true }); }}>
            {PRESETS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className="exec-filter"><span>From</span><input type="date" value={range.from} onChange={(e) => set("from", e.target.value)} /></label>
            <label className="exec-filter"><span>To</span><input type="date" value={range.to} onChange={(e) => set("to", e.target.value)} /></label>
          </>
        )}
        <label className="exec-filter">
          <span>Owner</span>
          <select value={owner} onChange={(e) => set("owner", e.target.value)}>
            <option value="">Everyone I can see</option>
            {options?.owners.map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
          </select>
        </label>
        <span className="pl-hint" style={{ marginLeft: "auto" }}>{range.from} to {range.to}{data?.cached ? " · cached for up to 2 minutes" : ""} · <button type="button" className="btn-link" onClick={() => void refetch()}>Refresh</button></span>
      </form>

      {isLoading && <p className="exec-state">Loading…</p>}
      {isError && <p className="exec-state is-crit">The dashboard could not be loaded.</p>}
      {data && (
        <>
          <MetricStrip metrics={metrics} label="Pipeline headline figures" />

          <div className="exec-grid exec-grid-2-1">
            <Panel eyebrow="Open now" title="Pipeline by stage" flush>
              <div className="exec-table-wrap">
                <table className="exec-table is-static">
                  <thead><tr><th>Stage</th><th className="num">Deals</th><th className="num">Premium</th><th className="num">Expected brokerage</th><th><span className="sr-only">Share</span></th></tr></thead>
                  <tbody>
                    {data.byStage.map((s) => (
                      <tr key={s.stage}>
                        <td><StatusBadge status={s.stage} /></td>
                        <td className="num">{s.count}</td>
                        <td className="num">{fmtMoney(s.premium)}</td>
                        <td className="num">{fmtMoney(s.expectedBrokerage)}</td>
                        <td style={{ minWidth: "8rem" }}><div className="exec-meter" role="img" aria-label={`${fmtPct((s.expectedBrokerage / maxExpected) * 100, 0)} of the largest stage`}><span style={{ width: `${(s.expectedBrokerage / maxExpected) * 100}%` }} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel eyebrow="Closed in the period" title="Why deals were lost">
              {data.lostReasons.length === 0 ? <p className="pl-hint" style={{ margin: 0 }}>No lost deals in this period.</p> : (
                <ul className="pl-checklist">
                  {data.lostReasons.map((r) => (
                    <li key={r.reason}><span style={{ flex: 1 }}>{r.reason}</span><b>{r.count}</b></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="exec-grid exec-grid-2">
            <Panel eyebrow="From recorded moves" title="Conversion between stages" flush>
              <div className="exec-table-wrap">
                <table className="exec-table is-static">
                  <thead><tr><th>Step</th><th className="num">Entered</th><th className="num">Went on</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {data.conversion.map((c) => (
                      <tr key={c.from}>
                        <td>{c.from} → {c.to}</td>
                        <td className="num">{c.entered}</td>
                        <td className="num">{c.reached}</td>
                        <td className="num">{c.ratePct === null ? "—" : fmtPct(c.ratePct, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pl-hint" style={{ padding: "0 0.85rem 0.6rem" }}>Counts deals that entered the stage in the period. Deals that existed before stage history began have no recorded entry date and are left out.</p>
            </Panel>

            <Panel eyebrow="Completed stays" title="Average time in each stage" flush>
              <div className="exec-table-wrap">
                <table className="exec-table is-static">
                  <thead><tr><th>Stage</th><th className="num">Average</th><th className="num">Deals</th></tr></thead>
                  <tbody>
                    {data.timeInStage.map((s) => (
                      <tr key={s.stage}><td>{s.stage}</td><td className="num">{s.avgDays === null ? "—" : `${s.avgDays.toFixed(1)} days`}</td><td className="num">{s.samples}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pl-hint" style={{ padding: "0 0.85rem 0.6rem" }}>Only stays that ended in the period. A deal still sitting in a stage is not averaged in.</p>
            </Panel>
          </div>

          <Panel eyebrow="Needs attention" title={`Deals at risk (${data.totals.atRiskCount})`} flush>
            {data.atRisk.length === 0 ? <p className="exec-state">Nothing is stale, overdue or about to expire.</p> : (
              <div className="exec-table-wrap">
                <table className="exec-table is-static">
                  <thead><tr><th>Deal</th><th>Stage</th><th>Owner</th><th className="num">Premium</th><th>Why</th></tr></thead>
                  <tbody>
                    {data.atRisk.map((r) => (
                      <tr key={r.id}>
                        <td className="wrap"><Link to={dealLink(r.id)}>{r.dealName}</Link><div className="pl-hint">{r.clientName}</div></td>
                        <td><StatusBadge status={r.stage} /></td>
                        <td>{r.owner || "Unassigned"}</td>
                        <td className="num">{fmtMoney(r.premium)}</td>
                        <td className="wrap"><ul className="exec-list">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel eyebrow="By owner" title="Leaderboard" flush>
            <div className="exec-table-wrap">
              <table className="exec-table is-static">
                <thead><tr><th>Owner</th><th className="num">Won</th><th className="num">Brokerage won</th><th className="num">Premium won</th><th className="num">Lost</th><th className="num">Win rate</th><th className="num">Open deals</th><th className="num">Open expected</th></tr></thead>
                <tbody>
                  {data.leaderboard.map((b) => (
                    <tr key={b.ownerId ?? "none"}>
                      <td><b>{b.owner}</b></td>
                      <td className="num">{b.won}</td>
                      <td className="num">{fmtMoney(b.wonBrokerage)}</td>
                      <td className="num">{fmtMoney(b.wonPremium)}</td>
                      <td className="num">{b.lost}</td>
                      <td className="num">{b.winRatePct === null ? "—" : fmtPct(b.winRatePct, 0)}</td>
                      <td className="num">{b.open}</td>
                      <td className="num">{fmtMoney(b.openExpected)}</td>
                    </tr>
                  ))}
                  {data.leaderboard.length === 0 && <tr><td colSpan={8} className="exec-empty">No deals in this view.</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

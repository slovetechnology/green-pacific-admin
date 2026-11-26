import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import type { ChaseDueRow, MarketResponses } from "../lib/markets";

// Across deals: the insurers to chase (their chase date has come) and how insurers answered the slips sent in a
// period, with the reasons they declined (backend sales/pipeline/dealMarkets.js listChaseDue / marketResponses).

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const yearAgo = () => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - 1); return isoDay(d); };
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);

export function MarketResponsesPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") || yearAgo();
  const to = params.get("to") || isoDay(new Date());
  const within = Number(params.get("within") ?? 0);
  const chase = useQuery({ queryKey: ["markets", "chase-due", within], queryFn: () => api.get<{ within: number; rows: ChaseDueRow[] }>(`/api/markets/chase-due?within=${within}`) });
  const report = useQuery({ queryKey: ["markets", "responses", from, to], queryFn: () => api.get<MarketResponses>(`/api/markets/responses?from=${from}&to=${to}`) });

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }

  const t = report.data?.totals;
  const answered = t ? t.quoted + t.declined : 0;
  const metrics: Metric[] = [
    { key: "chase", label: "To chase", value: chase.data?.rows.length ?? "…", tone: chase.data?.rows.length ? "warn" : "neutral" },
    { key: "approached", label: "Slips sent", value: t?.approached ?? "…", note: `${from} to ${to}` },
    { key: "quoted", label: "Quoted", value: t?.quoted ?? "…", note: answered && t ? `${Math.round((t.quoted / answered) * 100)}% of answers` : undefined },
    { key: "declined", label: "Declined", value: t?.declined ?? "…", tone: t?.declined ? "crit" : "neutral" },
    { key: "waiting", label: "Still waiting", value: t?.awaiting ?? "…" },
  ];
  const reasonLabel = new Map((report.data?.reasons ?? []).map((r) => [r.code, r.label]));

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Business & Sales</span>
          <h1>Market responses</h1>
        </div>
        <div className="exec-meta"><span>Insurers to chase, and how the market answered our slips.</span></div>
      </header>
      <MetricStrip metrics={metrics} label="Market summary" />

      <Panel
        eyebrow="Follow-up"
        title="Insurers to chase"
        actions={
          <label className="exec-filter">
            <span>Due</span>
            <select value={within} onChange={(e) => setParam("within", e.target.value === "0" ? null : e.target.value)}>
              <option value={0}>Today or earlier</option>
              <option value={7}>Within 7 days</option>
              <option value={14}>Within 14 days</option>
            </select>
          </label>
        }
      >
        {chase.isLoading && <p className="exec-state">Loading…</p>}
        {chase.error && <p className="exec-state">The chase list could not be loaded.</p>}
        {chase.data && chase.data.rows.length === 0 && <p className="pl-hint" style={{ margin: 0 }}>Nobody to chase.</p>}
        {chase.data && chase.data.rows.length > 0 && (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead><tr><th>Insurer</th><th>Deal</th><th>Status</th><th>Sent</th><th>Chase on</th><th>Chased</th></tr></thead>
              <tbody>
                {chase.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.insurer_name}</td>
                    <td><Link to={`/deals/${r.deal.id}?tab=markets`}>{r.deal.deal_name}</Link><div className="pl-hint">{r.client_name} · {r.deal.stage}</div></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.sent_at ? String(r.sent_at).slice(0, 10) : "—"}{r.days_out !== null && <div className="pl-hint">{r.days_out} days out</div>}</td>
                    <td>{r.chase_on}{r.chase_due && <> <span className="pl-chip is-crit">Due</span></>}</td>
                    <td>{r.chase_count ? `${r.chase_count}×` : "Not yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Reporting"
        title="How insurers answered"
        actions={
          <div className="pl-actions">
            <label className="exec-filter"><span>Sent from</span><input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} /></label>
            <label className="exec-filter"><span>to</span><input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} /></label>
          </div>
        }
      >
        {report.isLoading && <p className="exec-state">Loading…</p>}
        {report.error && <p className="exec-state">The report could not be loaded. Check the dates.</p>}
        {report.data && report.data.byInsurer.length === 0 && <p className="pl-hint" style={{ margin: 0 }}>No slips were sent in this period.</p>}
        {report.data && report.data.byInsurer.length > 0 && (
          <>
            <div className="exec-table-wrap">
              <table className="exec-table is-static">
                <thead><tr><th>Insurer</th><th className="num">Sent</th><th className="num">Quoted</th><th className="num">Declined</th><th className="num">Waiting</th><th className="num">No answer</th><th className="num">Quote ratio</th><th className="num">Avg. days to answer</th><th>Why they declined</th></tr></thead>
                <tbody>
                  {report.data.byInsurer.map((r) => (
                    <tr key={r.insurer_id}>
                      <td>{r.insurer_name}</td>
                      <td className="num">{r.approached}</td>
                      <td className="num">{r.quoted}</td>
                      <td className="num">{r.declined}</td>
                      <td className="num">{r.awaiting}</td>
                      <td className="num">{r.expired}</td>
                      <td className="num">{pct(r.quote_ratio)}</td>
                      <td className="num">{r.avg_turnaround_days ?? "—"}</td>
                      <td>{Object.entries(r.reasons).map(([code, n]) => `${reasonLabel.get(code) ?? code} (${n})`).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.data.declineReasons.length > 0 && (
              <>
                <h3 className="exec-sub" style={{ marginTop: "1rem" }}>Decline reasons</h3>
                <ul className="pl-hint">
                  {report.data.declineReasons.map((r) => <li key={r.code}>{r.label}: {r.count}</li>)}
                </ul>
              </>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

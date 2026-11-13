import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtPct } from "@/shared/lib/format";

interface StageRow { stage: string; count: number; value: number; weighted_value: number }
interface LostReason { reason: string; count: number }
interface Pipeline {
  by_stage: StageRow[];
  total_open_count: number;
  total_open_value: number;
  total_weighted_value: number;
  won_count: number;
  won_value: number;
  won_commission: number;
  lost_count: number;
  win_rate_pct: number | null;
  avg_deal_size: number;
  avg_sales_cycle_days: number;
  lost_reasons: LostReason[];
  new_pipeline_count: number;
  new_pipeline_value: number;
}
interface ProducerRow {
  id: number; name: string; monthly_quota: number; annual_quota: number;
  deals_won: number; won_value: number; commission_earned: number;
  activities_count: number; open_weighted_pipeline: number;
  monthly_quota_attainment_pct: number | null; annual_quota_attainment_pct: number | null;
}
interface CampaignRow {
  id: number; name: string; channel: string; status: string; budget: number;
  recipients: number; sent: number; opened: number; clicked: number;
  open_rate_pct: number | null; click_rate_pct: number | null;
  n_bound: number; commission_earned: number;
  cost_per_lead: number | null; cost_per_acquisition: number | null; roi_pct: number | null;
}
interface SourceRow { source: string; n_deals: number; n_bound: number; conversion_rate_pct: number | null; commission_earned: number }
interface Campaigns {
  by_campaign: CampaignRow[]; total_budget: number; total_commission: number;
  blended_roi_pct: number | null; by_source: SourceRow[];
}
interface Activities {
  total: number; by_type: { activity_type: string; n: number }[]; activity_to_win_ratio: number | null;
}
interface ClientGrowth {
  new_clients: number; renewal_eligible: number; renewed: number;
  renewal_retention_pct: number | null; client_acquisition_cost: number | null; active_client_count: number;
}
interface RevenueMix {
  new_business_commission: number; renewal_commission: number; total_commission: number;
  total_premium: number; commission_growth_pct: number | null; previous_total_commission: number;
}
interface Response {
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  pipeline: Pipeline;
  producers: ProducerRow[];
  campaigns: Campaigns;
  activities: Activities;
  client_growth: ClientGrowth;
  revenue_mix: RevenueMix;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
}

export function BusinessDevelopmentKpiPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["bd-kpis", start, end],
    queryFn: () => api.get<Response>(`/api/bd-kpis?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Business Development</p>
          <h1>Business Development KPI Dashboard</h1>
          <p className="page-lede">
            Pipeline, producer, campaign, activity, retention, and revenue-mix KPIs in one view — the
            single measurement layer over the CRM pipeline and production ledger.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to="/crm/attribution">Attribution</Link>
          <Link className="btn-secondary btn" to="/deals">Pipeline board</Link>
        </div>
      </div>

      <div className="toolbar">
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
          From
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem" }}>
          To
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        {data && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Showing {data.period.start} → {data.period.end} (vs. prior period {data.previous_period.start} → {data.previous_period.end})
          </p>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {data && (
        <>
          <div className="card">
            <h2>Pipeline &amp; Conversion</h2>
            <div className="kpi-row">
              <Kpi label="Open Pipeline" value={fmtMoney(data.pipeline.total_open_value)} sub={`${data.pipeline.total_open_count} open deals`} />
              <Kpi label="Weighted Pipeline" value={fmtMoney(data.pipeline.total_weighted_value)} />
              <Kpi label="Win Rate" value={data.pipeline.win_rate_pct === null ? "—" : fmtPct(data.pipeline.win_rate_pct)} sub={`${data.pipeline.won_count} won / ${data.pipeline.lost_count} lost`} />
              <Kpi label="Avg Deal Size" value={fmtMoney(data.pipeline.avg_deal_size)} />
              <Kpi label="Avg Sales Cycle" value={`${data.pipeline.avg_sales_cycle_days.toFixed(0)} days`} />
              <Kpi label="New Pipeline Created" value={fmtMoney(data.pipeline.new_pipeline_value)} sub={`${data.pipeline.new_pipeline_count} deals`} />
              <Kpi label="Commission Won" value={fmtMoney(data.pipeline.won_commission)} />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Stage</th><th className="num">Deals</th><th className="num">Value</th><th className="num">Weighted Value</th></tr>
                </thead>
                <tbody>
                  {data.pipeline.by_stage.map((s) => (
                    <tr key={s.stage}>
                      <td>{s.stage}</td>
                      <td className="num">{s.count}</td>
                      <td className="num">{fmtMoney(s.value)}</td>
                      <td className="num">{fmtMoney(s.weighted_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pipeline.lost_reasons.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Lost Reason</th><th className="num">Count</th></tr></thead>
                  <tbody>
                    {data.pipeline.lost_reasons.map((r) => (
                      <tr key={r.reason}><td>{r.reason}</td><td className="num">{r.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Producer Performance &amp; Quota Attainment</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producer</th><th className="num">Deals Won</th><th className="num">Won Value</th>
                    <th className="num">Commission Earned</th><th className="num">Monthly Quota Attain.</th>
                    <th className="num">Annual Quota Attain.</th><th className="num">Activities</th>
                    <th className="num">Open Weighted Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.producers.length === 0 && (
                    <tr><td colSpan={8} className="empty-state">No active producers on file.</td></tr>
                  )}
                  {data.producers.map((p) => (
                    <tr key={p.id}>
                      <td><Link to={`/producers/${p.id}`}>{p.name}</Link></td>
                      <td className="num">{p.deals_won}</td>
                      <td className="num">{fmtMoney(p.won_value)}</td>
                      <td className="num">{fmtMoney(p.commission_earned)}</td>
                      <td className="num">{p.monthly_quota_attainment_pct === null ? "—" : fmtPct(p.monthly_quota_attainment_pct)}</td>
                      <td className="num">{p.annual_quota_attainment_pct === null ? "—" : fmtPct(p.annual_quota_attainment_pct)}</td>
                      <td className="num">{p.activities_count}</td>
                      <td className="num">{fmtMoney(p.open_weighted_pipeline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Campaign &amp; Lead-Source ROI</h2>
            <div className="kpi-row">
              <Kpi label="Total Campaign Budget" value={fmtMoney(data.campaigns.total_budget)} />
              <Kpi label="Commission Attributed" value={fmtMoney(data.campaigns.total_commission)} />
              <Kpi label="Blended ROI" value={data.campaigns.blended_roi_pct === null ? "—" : fmtPct(data.campaigns.blended_roi_pct)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th><th>Channel</th><th className="num">Budget</th><th className="num">Recipients</th>
                    <th className="num">Open Rate</th><th className="num">Click Rate</th><th className="num">Deals Bound</th>
                    <th className="num">Cost / Lead</th><th className="num">Cost / Acquisition</th><th className="num">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.by_campaign.length === 0 && (
                    <tr><td colSpan={10} className="empty-state">No campaigns on file.</td></tr>
                  )}
                  {data.campaigns.by_campaign.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/campaigns/${c.id}`}>{c.name}</Link></td>
                      <td>{c.channel}</td>
                      <td className="num">{fmtMoney(c.budget)}</td>
                      <td className="num">{c.recipients}</td>
                      <td className="num">{c.open_rate_pct === null ? "—" : fmtPct(c.open_rate_pct)}</td>
                      <td className="num">{c.click_rate_pct === null ? "—" : fmtPct(c.click_rate_pct)}</td>
                      <td className="num">{c.n_bound}</td>
                      <td className="num">{c.cost_per_lead === null ? "—" : fmtMoney(c.cost_per_lead)}</td>
                      <td className="num">{c.cost_per_acquisition === null ? "—" : fmtMoney(c.cost_per_acquisition)}</td>
                      <td className="num">{c.roi_pct === null ? "—" : fmtPct(c.roi_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>By Lead Source</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Source</th><th className="num">Deals</th><th className="num">Bound</th><th className="num">Conversion Rate</th><th className="num">Commission</th></tr>
                </thead>
                <tbody>
                  {data.campaigns.by_source.length === 0 && (
                    <tr><td colSpan={5} className="empty-state">No lead sources recorded yet.</td></tr>
                  )}
                  {data.campaigns.by_source.map((s) => (
                    <tr key={s.source}>
                      <td>{s.source}</td>
                      <td className="num">{s.n_deals}</td>
                      <td className="num">{s.n_bound}</td>
                      <td className="num">{s.conversion_rate_pct === null ? "—" : fmtPct(s.conversion_rate_pct)}</td>
                      <td className="num">{fmtMoney(s.commission_earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Activity Productivity</h2>
            <div className="kpi-row">
              <Kpi label="Total Activities Logged" value={String(data.activities.total)} />
              <Kpi label="Activities per Won Deal" value={data.activities.activity_to_win_ratio === null ? "—" : data.activities.activity_to_win_ratio.toFixed(1)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Activity Type</th><th className="num">Count</th></tr></thead>
                <tbody>
                  {data.activities.by_type.length === 0 && (
                    <tr><td colSpan={2} className="empty-state">No activities logged in this period.</td></tr>
                  )}
                  {data.activities.by_type.map((a) => (
                    <tr key={a.activity_type}><td>{a.activity_type}</td><td className="num">{a.n}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Client Growth &amp; Retention</h2>
            <div className="kpi-row">
              <Kpi label="New Clients Acquired" value={String(data.client_growth.new_clients)} />
              <Kpi label="Client Acquisition Cost" value={data.client_growth.client_acquisition_cost === null ? "—" : fmtMoney(data.client_growth.client_acquisition_cost)} />
              <Kpi
                label="Renewal Retention Rate"
                value={data.client_growth.renewal_retention_pct === null ? "—" : fmtPct(data.client_growth.renewal_retention_pct)}
                sub={`${data.client_growth.renewed} renewed / ${data.client_growth.renewal_eligible} eligible`}
              />
              <Kpi label="Active Clients" value={String(data.client_growth.active_client_count)} />
            </div>
          </div>

          <div className="card">
            <h2>Revenue Mix &amp; Growth</h2>
            <div className="kpi-row">
              <Kpi label="New Business Commission" value={fmtMoney(data.revenue_mix.new_business_commission)} />
              <Kpi label="Renewal Commission" value={fmtMoney(data.revenue_mix.renewal_commission)} />
              <Kpi label="Total Commission" value={fmtMoney(data.revenue_mix.total_commission)} />
              <Kpi
                label="Commission Growth (vs prior period)"
                value={data.revenue_mix.commission_growth_pct === null ? "—" : fmtPct(data.revenue_mix.commission_growth_pct)}
                sub={`Prior period: ${fmtMoney(data.revenue_mix.previous_total_commission)}`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

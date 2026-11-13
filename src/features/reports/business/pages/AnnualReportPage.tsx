import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtPct } from "@/shared/lib/format";

interface Response {
  year: string;
  prior_year: string;
  available_years: string[];
  is_ytd: boolean;
  as_of_date: string | null;
  financials_available: boolean;
  summary: {
    total_revenue: number; revenue_growth_pct: number | null; net_income: number; profit_margin: number | null;
    active_clients: number; new_clients: number; retention_rate: number | null; n_policies: number;
  };
  revenue_breakdown: { label: string; value: number; pct: number }[];
  pnl: { total_revenue: number; operating_expenses: number | null; net_income: number; profit_margin: number | null; prior_total_revenue: number | null };
  lob_rows: { category: string; n_policies: number; premium_due: number; commission: number; pct_of_commission: number }[];
  client_metrics: { active_clients: number; prior_active_clients: number; new_clients: number; retained_clients: number; retention_rate: number | null };
  achievements: string[];
}

function kpiCard(label: string, value: string) {
  return (
    <div className="card kpi-card" key={label}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

export function AnnualReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get("year") || "";
  const qs = year ? `?year=${year}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "annual-report", year],
    queryFn: () => api.get<Response>(`/api/reports/annual-report${qs}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return null;
  const { summary } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>
            Annual Business Report — {data.year}
            {data.is_ytd && <span style={{ fontWeight: 400, fontSize: "0.6em", color: "var(--text-muted)" }}> (year to date)</span>}
          </h1>
        </div>
        <div className="page-header-actions">
          <select value={data.year} onChange={(e) => setSearchParams({ year: e.target.value })}>
            {data.available_years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!data.financials_available && (
        <div className="flash flash-error">
          No <a href="/financials">Financials</a> figures recorded for {data.year} — revenue/expense/profit are estimated from commission only.
        </div>
      )}

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {kpiCard("Total revenue", fmtMoney(summary.total_revenue))}
        {kpiCard("Revenue growth YoY", summary.revenue_growth_pct === null ? "—" : fmtPct(summary.revenue_growth_pct))}
        {kpiCard("Net income", fmtMoney(summary.net_income))}
        {kpiCard("Net profit margin", summary.profit_margin === null ? "—" : fmtPct(summary.profit_margin))}
        {kpiCard("Active clients", String(summary.active_clients))}
        {kpiCard("New clients", String(summary.new_clients))}
        {kpiCard("Retention rate", summary.retention_rate === null ? "—" : fmtPct(summary.retention_rate))}
        {kpiCard("Policies placed", String(summary.n_policies))}
      </div>

      <div className="card">
        <h2>Major Achievements</h2>
        <ul>
          {data.achievements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Revenue Breakdown</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="num">Value</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {data.revenue_breakdown.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">{fmtMoney(r.value)}</td>
                    <td className="num">{fmtPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Profit &amp; Loss</h2>
          <div className="donut-legend">
            <div className="donut-legend-item">
              <span className="name">Total revenue</span>
              <span className="val">{fmtMoney(data.pnl.total_revenue)}</span>
            </div>
            <div className="donut-legend-item">
              <span className="name">Operating expenses</span>
              <span className="val">{data.pnl.operating_expenses === null ? "n/a" : fmtMoney(data.pnl.operating_expenses)}</span>
            </div>
            <div className="donut-legend-item">
              <span className="name" style={{ fontWeight: 700 }}>
                Net income
              </span>
              <span className="val">{fmtMoney(data.pnl.net_income)}</span>
            </div>
            <div className="donut-legend-item">
              <span className="name" style={{ fontWeight: 700 }}>
                Net profit margin
              </span>
              <span className="val">{data.pnl.profit_margin === null ? "n/a" : fmtPct(data.pnl.profit_margin)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Lines of Business</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Policies</th>
                <th className="num">Premium Due</th>
                <th className="num">Commission</th>
                <th className="num">% of Commission</th>
              </tr>
            </thead>
            <tbody>
              {data.lob_rows.map((r) => (
                <tr key={r.category}>
                  <td>{r.category}</td>
                  <td className="num">{r.n_policies}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                  <td className="num">{fmtMoney(r.commission)}</td>
                  <td className="num">{fmtPct(r.pct_of_commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Client Metrics</h2>
        <div className="donut-legend">
          <div className="donut-legend-item">
            <span className="name">Active clients</span>
            <span className="val">{data.client_metrics.active_clients}</span>
          </div>
          <div className="donut-legend-item">
            <span className="name">Prior-year active clients</span>
            <span className="val">{data.client_metrics.prior_active_clients}</span>
          </div>
          <div className="donut-legend-item">
            <span className="name">New clients</span>
            <span className="val">{data.client_metrics.new_clients}</span>
          </div>
          <div className="donut-legend-item">
            <span className="name">Retained clients</span>
            <span className="val">{data.client_metrics.retained_clients}</span>
          </div>
          <div className="donut-legend-item">
            <span className="name">Retention rate</span>
            <span className="val">{data.client_metrics.retention_rate === null ? "—" : fmtPct(data.client_metrics.retention_rate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

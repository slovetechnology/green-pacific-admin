import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtPct } from "@/shared/lib/format";

interface Row {
  id: number; trans_date: string; business_type: string; premium_due: number;
  total_brokerage: number; commission_earned: number; client: string; policy_no: string;
}
interface RemittanceBucket {
  n: number; gross_premium: number; commission: number; net_premium: number;
}
interface Extras {
  expenses: { count: number; total: number; by_category: { category: string; total: number }[] };
  receivables: { total_outstanding: number; top_debtors: { client: string; debit_note_no: string | null; balance_os: number }[] };
  remittances: { awaiting: RemittanceBucket; recorded: RemittanceBucket };
  claims: { new_count: number; new_claimed: number; open_count: number; open_claimed: number };
  business_development: { new_deals: number; new_deals_value: number; activities: number };
}
interface Response {
  rows: Row[];
  metrics: {
    new_policies: number; premium_volume: number; renewals: number; renewal_rate: number;
    renewal_eligible: number; estimated_commission: number; actual_commission: number;
    interactions: number; active_clients: number; new_clients: number;
    pipeline_count: number; pipeline_value: number; pending_pipeline: number;
    monthly_budget: { target: number; actual: number; expense_target: number; expense_actual: number; available: boolean };
  };
  targets: Record<string, number>;
  progress: Record<string, number>;
  extras: Extras;
  weekStart: string;
  weekEnd: string;
}

function ProgressBar({ label, actual, target, pct, money = true }: { label: string; actual: number; target: number; pct: number; money?: boolean }) {
  const fmt = (v: number) => (money ? fmtMoney(v) : v.toLocaleString());
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>
          {fmt(actual)} / {fmt(target)} ({fmtPct(pct, 0)})
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function WeeklyBusinessReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "weekly-business"],
    queryFn: () => api.get<Response>("/api/reports/weekly-business"),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return null;
  const { metrics, targets, progress } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Weekly Business Report</h1>
        </div>
      </div>
      <p className="page-lede">
        {data.weekStart} – {data.weekEnd}
      </p>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">New policies</div>
          <div className="kpi-value">{metrics.new_policies}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Premium volume</div>
          <div className="kpi-value">{fmtMoney(metrics.premium_volume)}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Renewals</div>
          <div className="kpi-value">{metrics.renewals}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Commission (actual)</div>
          <div className="kpi-value">{fmtMoney(metrics.actual_commission)}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Interactions</div>
          <div className="kpi-value">{metrics.interactions}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Active clients</div>
          <div className="kpi-value">{metrics.active_clients}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">New clients</div>
          <div className="kpi-value">{metrics.new_clients}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Pipeline (pending KYC)</div>
          <div className="kpi-value">{metrics.pending_pipeline}</div>
        </div>
      </div>

      <div className="card">
        <h2>Progress against weekly targets</h2>
        <ProgressBar label="New policies" actual={metrics.new_policies} target={targets.new_policies} pct={progress.new_policies} money={false} />
        <ProgressBar label="Premium volume" actual={metrics.premium_volume} target={targets.premium_volume} pct={progress.premium_volume} />
        <ProgressBar label="Renewals" actual={metrics.renewals} target={targets.renewals} pct={progress.renewals} money={false} />
        <ProgressBar label="Commission" actual={metrics.actual_commission || metrics.estimated_commission} target={targets.commission} pct={progress.commission} />
        <ProgressBar label="Interactions" actual={metrics.interactions} target={targets.interactions} pct={progress.interactions} money={false} />
        {metrics.monthly_budget.available && (
          <ProgressBar label="Monthly revenue budget" actual={metrics.monthly_budget.actual} target={metrics.monthly_budget.target} pct={progress.business_budget} />
        )}
      </div>

      <div className="card">
        <h2>Transactions this week</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Policy No</th>
                <th>Business Type</th>
                <th className="num">Premium Due</th>
                <th className="num">Commission</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No activity this week.
                  </td>
                </tr>
              )}
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.trans_date}</td>
                  <td>{r.client}</td>
                  <td>
                    <Link to={`/transactions/${r.id}`}>{r.policy_no || "—"}</Link>
                  </td>
                  <td>{r.business_type}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                  <td className="num">{fmtMoney(r.commission_earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Expenses this week ({data.extras.expenses.count})</div>
          <div className="kpi-value">{fmtMoney(data.extras.expenses.total)}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Outstanding client premium</div>
          <div className="kpi-value">{fmtMoney(data.extras.receivables.total_outstanding)}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Awaiting remittance to insurers</div>
          <div className="kpi-value">{fmtMoney(data.extras.remittances.awaiting.net_premium)}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Open claims ({data.extras.claims.open_count})</div>
          <div className="kpi-value">{fmtMoney(data.extras.claims.open_claimed)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Expenses this week</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {data.extras.expenses.by_category.length === 0 && (
                <tr><td colSpan={2} className="empty-state">No expenses logged this week.</td></tr>
              )}
              {data.extras.expenses.by_category.map((e) => (
                <tr key={e.category}><td>{e.category}</td><td className="num">{fmtMoney(e.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Top outstanding client premium</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Debit note</th><th className="num">Outstanding</th></tr></thead>
            <tbody>
              {data.extras.receivables.top_debtors.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No outstanding premium.</td></tr>
              )}
              {data.extras.receivables.top_debtors.map((d, i) => (
                <tr key={i}><td>{d.client}</td><td>{d.debit_note_no || "—"}</td><td className="num">{fmtMoney(d.balance_os)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Insurer remittances</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th className="num">Records</th><th className="num">Gross premium</th><th className="num">Commission</th><th className="num">Net premium</th></tr></thead>
            <tbody>
              <tr>
                <td>Awaiting remittance</td>
                <td className="num">{data.extras.remittances.awaiting.n}</td>
                <td className="num">{fmtMoney(data.extras.remittances.awaiting.gross_premium)}</td>
                <td className="num">{fmtMoney(data.extras.remittances.awaiting.commission)}</td>
                <td className="num">{fmtMoney(data.extras.remittances.awaiting.net_premium)}</td>
              </tr>
              <tr>
                <td>Recorded / remitted</td>
                <td className="num">{data.extras.remittances.recorded.n}</td>
                <td className="num">{fmtMoney(data.extras.remittances.recorded.gross_premium)}</td>
                <td className="num">{fmtMoney(data.extras.remittances.recorded.commission)}</td>
                <td className="num">{fmtMoney(data.extras.remittances.recorded.net_premium)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="page-lede">
          <Link to="/insurer-remittances">Manage insurer remittances →</Link>
        </p>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Claims opened this week</div>
          <div className="kpi-value">{data.extras.claims.new_count}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">New deals this week</div>
          <div className="kpi-value">{data.extras.business_development.new_deals}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">CRM activities this week</div>
          <div className="kpi-value">{data.extras.business_development.activities}</div>
        </div>
      </div>
    </div>
  );
}

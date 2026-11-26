import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtPct } from "@/shared/lib/format";

interface Response {
  month_label: string;
  as_of_date: string;
  available_months: { value: string; label: string }[];
  sales_pipeline: {
    new_business_count: number; new_business_volume: number; renewals_written_count: number;
    renewals_written_volume: number; additions_count: number; additions_volume: number;
    new_clients: number; kyc_submissions: number; conversion_rate: number | null;
    pipeline_count: number; pipeline_value: number; gwp_target: number | null; gwp_actual: number | null;
  };
  lifecycle: {
    renewal_outlook: Record<string, { n: number; value: number }>;
    lapsed_count: number; lapsed_value: number; too_early_count: number; judged_count: number;
    lapse_rate: number | null; lapse_grace_days: number;
    cancelled_count: number; cancelled_volume: number; cancelled_commission_lost: number;
  };
  lob_rows: { category: string; n_policies: number; premium_due: number; commission: number; pct_of_commission: number }[];
  producer_rows: { producer: string; n_policies: number; n_clients: number; volume: number; commission: number; pct_of_policy_target: number; pct_of_commission_target: number }[];
  has_named_producers: boolean;
  aged_ar: {
    bucket_totals: { current: number; d31_60: number; d61_90: number; d90_plus: number };
    total_outstanding_premium: number;
    by_client: { client: string; current: number; d31_60: number; d61_90: number; d90_plus: number; total: number }[];
    by_client_count: number;
    deferred_commission_by_insurer: { insurer: string; n: number; value: number }[];
    total_deferred_commission: number;
  };
}

function kv(label: string, value: string) {
  return (
    <div className="donut-legend-item" key={label}>
      <span className="name">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
}

export function MonthlyBusinessReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") || "";
  const qs = month ? `?month=${month}` : "";

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "monthly-business", month],
    queryFn: () => api.get<Response>(`/api/reports/monthly-business${qs}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return null;
  const { sales_pipeline: sp, lifecycle: lc, aged_ar: ar } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Monthly Business Report — {data.month_label}</h1>
        </div>
        <div className="page-header-actions">
          <select value={month} onChange={(e) => setSearchParams(e.target.value ? { month: e.target.value } : {})}>
            {data.available_months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h2>Sales &amp; Pipeline</h2>
        <div className="donut-legend">
          {kv("New business", `${sp.new_business_count} policies · ${fmtMoney(sp.new_business_volume)}`)}
          {kv("Renewals written", `${sp.renewals_written_count} policies · ${fmtMoney(sp.renewals_written_volume)}`)}
          {kv("Additions", `${sp.additions_count} · ${fmtMoney(sp.additions_volume)}`)}
          {kv("New clients", String(sp.new_clients))}
          {kv("KYC submissions", String(sp.kyc_submissions))}
          {kv("Conversion rate", sp.conversion_rate === null ? "—" : fmtPct(sp.conversion_rate))}
          {kv("Pipeline (pending)", `${sp.pipeline_count} · ${fmtMoney(sp.pipeline_value)}`)}
          {kv("GWP target / actual", `${fmtMoney(sp.gwp_target || 0)} / ${fmtMoney(sp.gwp_actual || 0)}`)}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Renewal Outlook</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Window</th>
                  <th className="num">Policies</th>
                  <th className="num">Premium at Stake</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Next 30 days</td>
                  <td className="num">{lc.renewal_outlook.d30.n}</td>
                  <td className="num">{fmtMoney(lc.renewal_outlook.d30.value)}</td>
                </tr>
                <tr>
                  <td>30–60 days</td>
                  <td className="num">{lc.renewal_outlook.d60.n}</td>
                  <td className="num">{fmtMoney(lc.renewal_outlook.d60.value)}</td>
                </tr>
                <tr>
                  <td>60–90 days</td>
                  <td className="num">{lc.renewal_outlook.d90.n}</td>
                  <td className="num">{fmtMoney(lc.renewal_outlook.d90.value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Lapses &amp; Cancellations</h2>
          <div className="donut-legend">
            {kv("Lapse rate", lc.lapse_rate === null ? "—" : fmtPct(lc.lapse_rate))}
            {kv("Lapsed policies", `${lc.lapsed_count} · ${fmtMoney(lc.lapsed_value)}`)}
            {kv("Too early to judge", String(lc.too_early_count))}
            {kv("Cancelled", `${lc.cancelled_count} · ${fmtMoney(lc.cancelled_volume)}`)}
            {kv("Commission lost to cancellations", fmtMoney(lc.cancelled_commission_lost))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Product Line Performance</h2>
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
              {data.lob_rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No transactions this month.
                  </td>
                </tr>
              )}
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
        <h2>Producer Performance</h2>
        {!data.has_named_producers && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No named producers recorded this month — showing Unassigned.</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producer</th>
                <th className="num">Policies</th>
                <th className="num">Clients</th>
                <th className="num">Volume</th>
                <th className="num">Commission</th>
                <th className="num">% Policy Target</th>
                <th className="num">% Commission Target</th>
              </tr>
            </thead>
            <tbody>
              {data.producer_rows.map((r) => (
                <tr key={r.producer}>
                  <td>{r.producer}</td>
                  <td className="num">{r.n_policies}</td>
                  <td className="num">{r.n_clients}</td>
                  <td className="num">{fmtMoney(r.volume)}</td>
                  <td className="num">{fmtMoney(r.commission)}</td>
                  <td className="num">{fmtPct(r.pct_of_policy_target)}</td>
                  <td className="num">{fmtPct(r.pct_of_commission_target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Aged Accounts Receivable</h2>
        <p className="page-lede">Live position as of {data.as_of_date}, total outstanding {fmtMoney(ar.total_outstanding_premium)}.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Current (≤30d)</th>
                <th>31–60d</th>
                <th>61–90d</th>
                <th>90d+</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{fmtMoney(ar.bucket_totals.current)}</td>
                <td className="num">{fmtMoney(ar.bucket_totals.d31_60)}</td>
                <td className="num">{fmtMoney(ar.bucket_totals.d61_90)}</td>
                <td className="num">{fmtMoney(ar.bucket_totals.d90_plus)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h2 style={{ marginTop: "1.25rem" }}>Top Outstanding Clients</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="num">Current</th>
                <th className="num">31–60d</th>
                <th className="num">61–90d</th>
                <th className="num">90d+</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {ar.by_client.map((r) => (
                <tr key={r.client}>
                  <td>{r.client}</td>
                  <td className="num">{fmtMoney(r.current)}</td>
                  <td className="num">{fmtMoney(r.d31_60)}</td>
                  <td className="num">{fmtMoney(r.d61_90)}</td>
                  <td className="num">{fmtMoney(r.d90_plus)}</td>
                  <td className="num">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ar.deferred_commission_by_insurer.length > 0 && (
          <>
            <h2 style={{ marginTop: "1.25rem" }}>Deferred Commission by Carrier</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Insurer</th>
                    <th className="num">Policies</th>
                    <th className="num">Deferred Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {ar.deferred_commission_by_insurer.map((r) => (
                    <tr key={r.insurer}>
                      <td>{r.insurer}</td>
                      <td className="num">{r.n}</td>
                      <td className="num">{fmtMoney(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="page-lede" style={{ marginTop: ".5rem" }}>
              Deferred commission is the not-yet-elapsed portion of each active policy&rsquo;s term, not premium
              owed by the client or commission overdue from the carrier.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import { useSearchParams } from "react-router";
import { ReportSearch } from "../components/ReportSearch";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface Row {
  id: number; policy_no: string; client: string; class_of_business: string; insurer: string;
  start_date: string; end_date: string; period_days: number;
  sum_insured: number; premium_due: number; total_brokerage: number; status: string;
}
interface Response {
  rows: Row[];
  totals: { sum_insured: number; premium_due: number; total_brokerage: number };
  excluded: { marine: number; short_period: number };
  insurers: { id: number; name: string }[];
  months: { value: string; label: string }[];
  month: string;
  sourceMonthLabel: string;
  filterDesc: string;
}

export function UpcomingRenewalsReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const monthParam = searchParams.get("month") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(monthParam && { month: monthParam }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "upcoming-renewals", qs],
    queryFn: () => api.get<Response>(`/api/reports/upcoming-renewals${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Upcoming Renewals</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/upcoming-renewals/excel${qs ? `?${qs}` : ""}`)}>
            Download Excel
          </a>
          <a className="btn" href={apiUrl(`/api/reports/upcoming-renewals/pdf${qs ? `?${qs}` : ""}`)}>
            Download PDF
          </a>
        </div>
      </div>

      {data?.filterDesc && <p className="page-lede">{data.filterDesc}</p>}

      <div className="toolbar">
        <ReportSearch key={q} value={q} onSearch={(v) => setFilter("q", v)} />
        <select value={data?.month || monthParam} onChange={(e) => setFilter("month", e.target.value)}>
          {(data?.months || []).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={insurerId} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy No</th>
                <th>Client</th>
                <th>Class</th>
                <th>Insurer</th>
                <th>Start</th>
                <th>Expiry</th>
                <th className="num">Days</th>
                <th className="num">Sum Insured</th>
                <th className="num">Premium</th>
                <th className="num">Brokerage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={11}>Loading…</td>
                </tr>
              )}
              {!isLoading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-state">
                    No renewable policies from {data.sourceMonthLabel} expire in this month.
                  </td>
                </tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.policy_no}</td>
                  <td>{r.client}</td>
                  <td>{r.class_of_business}</td>
                  <td>{r.insurer}</td>
                  <td>{r.start_date}</td>
                  <td>{r.end_date}</td>
                  <td className="num">{r.period_days}</td>
                  <td className="num">{fmtMoney(r.sum_insured)}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                  <td className="num">{fmtMoney(r.total_brokerage)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={7}>TOTAL</td>
                  <td className="num">{fmtMoney(data.totals.sum_insured)}</td>
                  <td className="num">{fmtMoney(data.totals.premium_due)}</td>
                  <td className="num">{fmtMoney(data.totals.total_brokerage)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {data && (
        <p className="page-lede">
          Left out: {data.excluded.marine} Marine (one-off, not renewable) and {data.excluded.short_period} with a
          period of insurance outside 364-366 days.
        </p>
      )}
    </div>
  );
}

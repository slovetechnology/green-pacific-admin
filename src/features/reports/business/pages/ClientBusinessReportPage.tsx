import { useSearchParams } from "react-router";
import { ReportSearch } from "../components/ReportSearch";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface Row {
  client: string; premium_due: number; premium_paid: number; balance_os: number;
  total_brokerage: number; status: string;
}
interface Response {
  rows: Row[];
  totals: { premium_due: number; premium_paid: number; balance_os: number; total_brokerage: number };
  byClient: { client: string; premium_due: number }[];
  insurers: { id: number; name: string }[];
  months: { value: string; label: string }[];
  statuses: string[];
  periodLabel: string;
}

export function ClientBusinessReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const status = searchParams.get("status") || "";
  const month = searchParams.get("month") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(status && { status }),
    ...(month && { month }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "client-business", qs],
    queryFn: () => api.get<Response>(`/api/reports/client-business${qs ? `?${qs}` : ""}`),
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
          <h1>Client Business Report{data ? ` as at ${data.periodLabel}` : ""}</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn" href={apiUrl(`/api/reports/client-business/pdf${qs ? `?${qs}` : ""}`)}>
            Download PDF
          </a>
        </div>
      </div>

      <div className="toolbar">
        <ReportSearch key={q} value={q} onSearch={(v) => setFilter("q", v)} />
        <select value={insurerId} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setFilter("month", e.target.value)}>
          {(data?.months || []).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {(data?.statuses || []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="num">Premium Due</th>
                <th className="num">Premium Paid</th>
                <th className="num">Balance O/S</th>
                <th className="num">Total Brokerage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              )}
              {!isLoading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No transactions for this period.
                  </td>
                </tr>
              )}
              {data?.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.client}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                  <td className="num">{fmtMoney(r.premium_paid)}</td>
                  <td className="num">{fmtMoney(r.balance_os)}</td>
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
                  <td>TOTAL</td>
                  <td className="num">{fmtMoney(data.totals.premium_due)}</td>
                  <td className="num">{fmtMoney(data.totals.premium_paid)}</td>
                  <td className="num">{fmtMoney(data.totals.balance_os)}</td>
                  <td className="num">{fmtMoney(data.totals.total_brokerage)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Summary by Client</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th className="num">Premium Due</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byClient || []).map((r) => (
                <tr key={r.client}>
                  <td>{r.client}</td>
                  <td className="num">{fmtMoney(r.premium_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { Panel } from "@/shared/components/exec/Panel";

interface Breakdown { name: string; count: number; premium_due: number; total_brokerage: number }
interface CancelledReport {
  rows: { kind: string }[];
  totals: { count: number; premium_due: number; total_brokerage: number; premium_paid: number };
  byInsurer: Breakdown[];
  byClass: Breakdown[];
}

// Dashboard panel: the premium and commission lost to cancellations in the dashboard's year, from the
// Cancelled Transactions report (each cancellation dated by when it was recorded).
export function CancelledPoliciesWidget({ year }: { year: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "cancelled-transactions", `year=${year}`],
    queryFn: () => api.get<CancelledReport>(`/api/reports/cancelled-transactions?year=${year}`),
    retry: false,
  });
  if (error) return null;
  const policies = data ? data.rows.filter((r) => r.kind === "Policy").length : 0;
  const top = data?.byClass.slice(0, 5) ?? [];
  return (
    <Panel
      eyebrow="Cancellations"
      title={`Cancelled policies, ${year}`}
      actions={<Link className="exec-rowbtn" to={`/reports/cancelled-transactions?year=${year}`}>Report</Link>}
      flush
    >
      <div className="exec-metrics" role="group" aria-label="Income lost to cancellations">
        <div className="exec-metric">
          <div className="exec-metric-label">Premium lost</div>
          <div className="exec-metric-value is-warn" title={data ? fmtMoney(data.totals.premium_due) : undefined}>{data ? fmtMoneyShort(data.totals.premium_due) : "…"}</div>
        </div>
        <div className="exec-metric">
          <div className="exec-metric-label">Commission lost</div>
          <div className="exec-metric-value is-warn" title={data ? fmtMoney(data.totals.total_brokerage) : undefined}>{data ? fmtMoneyShort(data.totals.total_brokerage) : "…"}</div>
        </div>
        <div className="exec-metric">
          <div className="exec-metric-label">Policies cancelled</div>
          <div className="exec-metric-value">{data ? policies : "…"}</div>
          {data && data.totals.count > policies && <div className="exec-metric-note">plus {data.totals.count - policies} endorsement note(s)</div>}
        </div>
        <div className="exec-metric">
          <div className="exec-metric-label">Premium already paid</div>
          <div className="exec-metric-value" title={data ? fmtMoney(data.totals.premium_paid) : undefined}>{data ? fmtMoneyShort(data.totals.premium_paid) : "…"}</div>
          {data && data.totals.premium_paid > 0 && <div className="exec-metric-note">check for refunds due</div>}
        </div>
      </div>
      <div className="exec-table-wrap">
        <table className="exec-table is-static exec-mini-table">
          <thead><tr><th scope="col">Class of business</th><th scope="col" className="num">Cancelled</th><th scope="col" className="num">Premium lost</th><th scope="col" className="num">Commission lost</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
            {data && top.length === 0 && <tr><td colSpan={4}>No cancellations recorded in {year}.</td></tr>}
            {top.map((c) => (
              <tr key={c.name}>
                <td className="wrap">{c.name}</td>
                <td className="num">{c.count}</td>
                <td className="num">{fmtMoneyShort(c.premium_due)}</td>
                <td className="num">{fmtMoneyShort(c.total_brokerage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

import "@/shared/styles/ledger.css";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinorOrBlank } from "../api/ledger";
import { CurrencyNote, ReportToolbar } from "../components/ReportToolbar";
import { useReportFilters } from "../components/useReportFilters";

interface Row {
  accountId: number | null;
  code: string;
  name: string;
  type: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  computed?: boolean;
}
interface TrialBalance {
  from: string;
  to: string;
  currency: string;
  rate: number;
  rateDate: string | null;
  rows: Row[];
  totals: { openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number };
  balanced: boolean;
}

const dr = (v: number, c: string) => fmtMinorOrBlank(Math.max(v, 0), c);
const cr = (v: number, c: string) => fmtMinorOrBlank(Math.max(-v, 0), c);

/** Trial Balance: every account with a balance or movement, opening + period debits/credits = closing. */
export function TrialBalancePage() {
  const [filters, setFilters] = useReportFilters();
  const params = { from: filters.from, to: filters.to, currency: filters.currency };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "trial-balance", params],
    queryFn: () => api.get<TrialBalance>(`/api/gl/reports/trial-balance?${new URLSearchParams(params)}`),
  });
  const c = data?.currency ?? "NGN";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Trial Balance</h1>
          <p className="ledger-intro">Posted journals only. Income and expense accounts start from zero each January; earlier years' profit shows as one equity line until the year is closed.</p>
        </div>
      </div>
      <ReportToolbar filters={filters} onChange={setFilters} exportPath="/api/gl/reports/trial-balance" exportParams={params} />
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the trial balance."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <div className="card">
          <div className="ledger-check">
            {data.balanced
              ? <span className="badge badge-paid">Balanced: debits equal credits</span>
              : <span className="badge badge-unpaid">Out of balance: tell the developer, this should never happen</span>}
          </div>
          <CurrencyNote currency={data.currency} rate={data.rate} rateDate={data.rateDate} />
          <div className="table-wrap">
            <table className="data-grid-table ledger-statement">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th className="num">Opening Dr</th>
                  <th className="num">Opening Cr</th>
                  <th className="num">Debits</th>
                  <th className="num">Credits</th>
                  <th className="num">Closing Dr</th>
                  <th className="num">Closing Cr</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={8} className="ledger-note">Nothing posted in this range.</td></tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.accountId ?? r.name}>
                    <td className="ledger-code">{r.code}</td>
                    <td>
                      {r.accountId
                        ? <Link to={`/ledger/accounts/${r.accountId}?from=${data.from}&to=${data.to}`}>{r.name}</Link>
                        : <em>{r.name}</em>}
                    </td>
                    <td className="num">{dr(r.opening, c)}</td>
                    <td className="num">{cr(r.opening, c)}</td>
                    <td className="num">{fmtMinorOrBlank(r.debit, c)}</td>
                    <td className="num">{fmtMinorOrBlank(r.credit, c)}</td>
                    <td className="num">{dr(r.closing, c)}</td>
                    <td className="num">{cr(r.closing, c)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ledger-grand-total">
                  <th colSpan={2}>Total</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.openingDebit, c)}</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.openingCredit, c)}</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.debit, c)}</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.credit, c)}</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.closingDebit, c)}</th>
                  <th className="num">{fmtMinorOrBlank(data.totals.closingCredit, c)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

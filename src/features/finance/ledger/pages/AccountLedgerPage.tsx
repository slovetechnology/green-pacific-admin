import "@/shared/styles/ledger.css";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor, fmtMinorOrBlank } from "../api/ledger";
import { ReportToolbar } from "../components/ReportToolbar";
import { useReportFilters } from "../components/useReportFilters";

interface Ledger {
  account: { id: number; code: string; name: string; type: string; classification: string; debitNormal: boolean };
  from: string;
  to: string;
  opening: number;
  closing: number;
  truncated: boolean;
  rows: { journalId: number; journalNo: string; date: string; description: string; memo: string | null; debit: number; credit: number; balance: number }[];
}

/** One account's postings with a running balance (on the account's usual side). */
export function AccountLedgerPage() {
  const { accountId } = useParams();
  const [filters, setFilters] = useReportFilters();
  const params = { from: filters.from, to: filters.to };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "account", accountId, params],
    queryFn: () => api.get<Ledger>(`/api/gl/reports/account/${accountId}?${new URLSearchParams(params)}`),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to={`/ledger/trial-balance?from=${filters.from}&to=${filters.to}`}>Trial Balance</Link></p>
          <h1>{data ? `${data.account.code} ${data.account.name}` : "Account ledger"}</h1>
          {data && (
            <p className="ledger-intro">
              {data.account.type}{data.account.classification === "Fiduciary" ? " · client money" : ""} · balances shown on the {data.account.debitNormal ? "debit" : "credit"} side
            </p>
          )}
        </div>
      </div>
      <ReportToolbar showCurrency={false} filters={filters} onChange={setFilters} exportPath={`/api/gl/reports/account/${accountId}`} exportParams={params} />
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the ledger."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <div className="card">
          {data.truncated && <p className="ledger-note">Showing the first 5,000 lines; narrow the dates to see the rest.</p>}
          <div className="table-wrap">
            <table className="data-grid-table ledger-statement">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Journal</th>
                  <th>Description</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="ledger-subtotal">
                  <td>{data.from}</td>
                  <td />
                  <td>Opening balance</td>
                  <td />
                  <td />
                  <td className="num">{fmtMinor(data.opening)}</td>
                </tr>
                {data.rows.map((r, i) => (
                  <tr key={`${r.journalId}-${i}`}>
                    <td>{r.date}</td>
                    <td><Link to={`/ledger/journals/${r.journalId}`}>{r.journalNo}</Link></td>
                    <td>{r.description}{r.memo ? <span className="ledger-memo"> · {r.memo}</span> : null}</td>
                    <td className="num">{fmtMinorOrBlank(r.debit)}</td>
                    <td className="num">{fmtMinorOrBlank(r.credit)}</td>
                    <td className="num">{fmtMinor(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ledger-grand-total">
                  <th colSpan={5}>Closing balance at {data.to}</th>
                  <th className="num">{fmtMinor(data.closing)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

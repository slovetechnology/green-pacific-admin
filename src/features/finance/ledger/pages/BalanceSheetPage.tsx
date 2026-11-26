import "@/shared/styles/ledger.css";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor } from "../api/ledger";
import { CurrencyNote, ReportToolbar } from "../components/ReportToolbar";
import { StatementSections, type StatementSection } from "../components/StatementSections";
import { useReportFilters } from "../components/useReportFilters";
import { Kpi } from "./ProfitLossPage";

interface BalanceSheet {
  asAt: string;
  currency: string;
  rate: number;
  rateDate: string | null;
  assets: StatementSection[];
  liabilities: StatementSection[];
  equity: StatementSection[];
  totals: { assets: number; liabilities: number; equity: number; liabilitiesAndEquity: number; difference: number };
  trust: { assets: number; liabilities: number; position: number };
}

/** Statement of Financial Position, with client money (trust) shown apart from the broker's own. */
export function BalanceSheetPage() {
  const [filters, setFilters] = useReportFilters();
  const params = { as_at: filters.to, currency: filters.currency };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "balance-sheet", params],
    queryFn: () => api.get<BalanceSheet>(`/api/gl/reports/balance-sheet?${new URLSearchParams(params)}`),
  });
  const c = data?.currency ?? "NGN";
  const range = { from: `${filters.to.slice(0, 4)}-01-01`, to: filters.to };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Balance Sheet</h1>
          <p className="ledger-intro">Client money (premium held in trust and owed to insurers) is marked, and checked against what is held for it.</p>
        </div>
      </div>
      <ReportToolbar asAt filters={filters} onChange={setFilters} exportPath="/api/gl/reports/balance-sheet" exportParams={params} />
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the balance sheet."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <>
          <CurrencyNote currency={data.currency} rate={data.rate} rateDate={data.rateDate} />
          <div className="kpi-row">
            <Kpi label="Client money held" value={fmtMinor(data.trust.assets, c)} />
            <Kpi label="Client money owed" value={fmtMinor(data.trust.liabilities, c)} />
            <Kpi label={data.trust.position >= 0 ? "Trust surplus" : "Trust shortfall"} value={fmtMinor(data.trust.position, c)} tone={data.trust.position >= 0 ? "good" : "bad"} />
          </div>
          {data.trust.position < 0 && (
            <div className="flash flash-error">
              Client money held is less than the premium owed to insurers. Under NAICOM's client-money rules the trust account must
              cover it: check for operating payments made from the trust account, or receipts not yet banked.
            </div>
          )}
          {data.totals.difference !== 0 && (
            <div className="flash flash-error">Assets and liabilities plus equity differ by {fmtMinor(data.totals.difference, c)}.</div>
          )}
          <StatementSections title="Assets" sections={data.assets} total={data.totals.assets} totalLabel="Total assets" currency={c} ledgerRange={range} showClassification />
          <StatementSections title="Liabilities" sections={data.liabilities} total={data.totals.liabilities} totalLabel="Total liabilities" currency={c} ledgerRange={range} showClassification />
          <StatementSections title="Equity" sections={data.equity} total={data.totals.equity} totalLabel="Total equity" currency={c} ledgerRange={range} />
          <div className="card ledger-bottom-line">
            <span>Total liabilities and equity</span>
            <strong>{fmtMinor(data.totals.liabilitiesAndEquity, c)}</strong>
          </div>
        </>
      )}
    </div>
  );
}

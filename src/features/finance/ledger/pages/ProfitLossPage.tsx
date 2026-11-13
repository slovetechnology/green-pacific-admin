import "@/shared/styles/ledger.css";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor } from "../api/ledger";
import { CurrencyNote, ReportToolbar } from "../components/ReportToolbar";
import { StatementSections, type StatementSection } from "../components/StatementSections";
import { useReportFilters } from "../components/useReportFilters";

interface ProfitAndLoss {
  from: string;
  to: string;
  currency: string;
  rate: number;
  rateDate: string | null;
  income: StatementSection[];
  expenses: StatementSection[];
  totals: { income: number; commissionEarned: number; expenses: number; profit: number };
}

/** Statement of Profit or Loss: commission earned and other income against operating expenses. */
export function ProfitLossPage() {
  const [filters, setFilters] = useReportFilters();
  const params = { from: filters.from, to: filters.to, currency: filters.currency };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "profit-and-loss", params],
    queryFn: () => api.get<ProfitAndLoss>(`/api/gl/reports/profit-and-loss?${new URLSearchParams(params)}`),
  });
  const c = data?.currency ?? "NGN";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Profit or Loss</h1>
          <p className="ledger-intro">Brokerage is earned when the client's premium is received (No Premium, No Cover), so it follows receipts, not debit notes.</p>
        </div>
      </div>
      <ReportToolbar filters={filters} onChange={setFilters} exportPath="/api/gl/reports/profit-and-loss" exportParams={params} />
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the statement."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <>
          <CurrencyNote currency={data.currency} rate={data.rate} rateDate={data.rateDate} />
          <div className="kpi-row">
            <Kpi label="Commission earned" value={fmtMinor(data.totals.commissionEarned, c)} />
            <Kpi label="Total income" value={fmtMinor(data.totals.income, c)} />
            <Kpi label="Operating expenses" value={fmtMinor(data.totals.expenses, c)} />
            <Kpi label={data.totals.profit >= 0 ? "Profit" : "Loss"} value={fmtMinor(data.totals.profit, c)} tone={data.totals.profit >= 0 ? "good" : "bad"} />
          </div>
          <StatementSections title="Income" sections={data.income} total={data.totals.income} totalLabel="Total income" currency={c} ledgerRange={data} />
          <StatementSections title="Expenses" sections={data.expenses} total={data.totals.expenses} totalLabel="Total expenses" currency={c} ledgerRange={data} />
          <div className="card ledger-bottom-line">
            <span>{data.totals.profit >= 0 ? "Profit for the period" : "Loss for the period"}</span>
            <strong>{fmtMinor(data.totals.profit, c)}</strong>
          </div>
        </>
      )}
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card kpi-card">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value${tone ? ` ledger-${tone}` : ""}`} title={value}>{value}</span>
    </div>
  );
}

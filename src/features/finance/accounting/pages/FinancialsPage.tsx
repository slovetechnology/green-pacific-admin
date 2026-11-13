import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";

interface Month {
  month: number;
  label: string;
  has_target: boolean;
  income_target: number;
  income_actual: number;
  expense_target: number;
  expense_actual: number;
  profit_target: number;
  profit_actual: number;
}

interface Totals {
  income_target: number;
  income_actual: number;
  expense_target: number;
  expense_actual: number;
  profit_target: number;
  profit_actual: number;
}

interface Quarter extends Totals {
  label: string;
}

interface Response {
  year: number;
  availableYears: number[];
  months: Month[];
  totals: Totals;
  quarters: Quarter[];
}

function profitColor(value: number) {
  return value >= 0 ? "var(--status-good)" : "var(--status-critical)";
}

const QUARTER_OPTIONS = [
  ["1", "Q1 (Jan–Mar)"], ["2", "Q2 (Apr–Jun)"], ["3", "Q3 (Jul–Sep)"], ["4", "Q4 (Oct–Dec)"],
] as const;

const TOTAL_KEYS = ["income_target", "income_actual", "expense_target", "expense_actual", "profit_target", "profit_actual"] as const;

function sumMonths(months: Month[]): Totals {
  const zero: Totals = { income_target: 0, income_actual: 0, expense_target: 0, expense_actual: 0, profit_target: 0, profit_actual: 0 };
  return months.reduce((acc, m) => {
    for (const k of TOTAL_KEYS) acc[k] += m[k];
    return acc;
  }, zero);
}

export function FinancialsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const quarter = searchParams.get("quarter") || "";
  const status = searchParams.get("status") || "";
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["financials", year],
    queryFn: () => api.get<Response>(`/api/financials?year=${year}`),
  });

  function updateParams(next: Record<string, string>) {
    setSearchParams({ year: String(year), quarter, status, ...next });
  }

  async function importWorkbook(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<{ created: number; updated: number; months: number; years: number[] }>("/api/financials/import", form);
      setImportMessage(`Imported ${result.months} month(s) for ${result.years.join(", ")}: ${result.created} created, ${result.updated} updated.`);
      await queryClient.invalidateQueries({ queryKey: ["financials"] });
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Could not import the workbook.");
    } finally {
      setImporting(false);
    }
  }

  if (isLoading || !data) return <p>Loading…</p>;
  const { totals } = data;

  const now = new Date();
  const filteredMonths = data.months.filter((m) => {
    if (quarter && Math.ceil(m.month / 3) !== Number(quarter)) return false;
    if (status === "set" && !m.has_target) return false;
    if (status === "unset" && m.has_target) return false;
    return true;
  });
  const filteredTotals = sumMonths(filteredMonths);
  const isFiltered = quarter !== "" || status !== "";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Company performance</p>
          <h1>Financials — {data.year}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Monthly income and expense targets vs. actuals. Expense actuals are the live total of the{" "}
            <Link to={`/expenses?year=${data.year}`}>expense ledger</Link> for each month.
          </p>
        </div>
        <div className="page-header-actions">
          <label className="btn-secondary btn" style={{ cursor: importing ? "wait" : "pointer" }}>
            {importing ? "Importing…" : "Import Target Data.xlsx"}
            <input type="file" accept=".xlsx" hidden disabled={importing} onChange={(e) => { void importWorkbook(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
          <button type="button" className="btn-secondary btn" onClick={() => navigate("/expenses")}>
            Manage expenses
          </button>
        </div>
      </div>

      {importMessage && <div className="flash flash-success">{importMessage}</div>}
      {importError && <div className="flash flash-error">{importError}</div>}

      <div className="toolbar">
        <select value={data.year} onChange={(e) => updateParams({ year: e.target.value })}>
          {data.availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={quarter} onChange={(e) => updateParams({ quarter: e.target.value })}>
          <option value="">All quarters</option>
          {QUARTER_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value })}>
          <option value="">All months</option>
          <option value="set">Target set</option>
          <option value="unset">No target set</option>
        </select>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Income</div>
          <div className="kpi-value">{fmtMoneyShort(totals.income_actual)}</div>
          <span>of {fmtMoneyShort(totals.income_target)} target</span>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Expense</div>
          <div className="kpi-value">{fmtMoneyShort(totals.expense_actual)}</div>
          <span>of {fmtMoneyShort(totals.expense_target)} target</span>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Net profit</div>
          <div className="kpi-value" style={{ color: profitColor(totals.profit_actual) }}>{fmtMoneyShort(totals.profit_actual)}</div>
          <span>of {fmtMoneyShort(totals.profit_target)} target</span>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Achievement</div>
          <div className="kpi-value">
            {totals.income_target ? fmtPct((totals.income_actual / totals.income_target) * 100) : "n/a"}
          </div>
          <span>income target achieved</span>
        </div>
      </div>

      <div className="card">
        <h2>Monthly — Income &amp; expense, target vs. actual</h2>
        {isFiltered && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            Showing {filteredMonths.length} of {data.months.length} months.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Income Target</th><th className="num">Income Actual</th>
                <th className="num">Expense Target</th><th className="num">Expense Actual</th>
                <th className="num">Profit Target</th><th className="num">Profit Actual</th>
                <th className="num">Achievement</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMonths.length === 0 && (
                <tr><td colSpan={9} className="empty-state">No months match these filters.</td></tr>
              )}
              {filteredMonths.map((m) => {
                const isCurrentMonth = data.year === now.getFullYear() && m.month === now.getMonth() + 1;
                return (
                  <tr key={m.month} style={isCurrentMonth ? { borderLeft: "3px solid var(--brand)" } : undefined}>
                    <td>{m.label}{isCurrentMonth && <span className="badge badge-paid" style={{ marginLeft: "0.5rem" }}>This month</span>}</td>
                    <td className="num">{fmtMoney(m.income_target)}</td>
                    <td className="num">{fmtMoney(m.income_actual)}</td>
                    <td className="num">{fmtMoney(m.expense_target)}</td>
                    <td className="num">{fmtMoney(m.expense_actual)}</td>
                    <td className="num">{fmtMoney(m.profit_target)}</td>
                    <td className="num" style={{ color: profitColor(m.profit_actual) }}>{fmtMoney(m.profit_actual)}</td>
                    <td className="num">{m.income_target ? fmtPct((m.income_actual / m.income_target) * 100) : "—"}</td>
                    <td>
                      <RoleGate need="write">
                        <Link to={`/financials/${data.year}/${m.month}/edit`} className="btn-secondary btn-sm">
                          {m.has_target ? "Edit" : "+ Set target"}
                        </Link>
                      </RoleGate>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>{isFiltered ? "SUBTOTAL" : "TOTAL"}</td>
                <td className="num">{fmtMoney(filteredTotals.income_target)}</td>
                <td className="num">{fmtMoney(filteredTotals.income_actual)}</td>
                <td className="num">{fmtMoney(filteredTotals.expense_target)}</td>
                <td className="num">{fmtMoney(filteredTotals.expense_actual)}</td>
                <td className="num">{fmtMoney(filteredTotals.profit_target)}</td>
                <td className="num">{fmtMoney(filteredTotals.profit_actual)}</td>
                <td className="num">
                  {filteredTotals.income_target ? fmtPct((filteredTotals.income_actual / filteredTotals.income_target) * 100) : "—"}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Quarterly rollup</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quarter</th>
                <th className="num">Income Target</th><th className="num">Income Actual</th>
                <th className="num">Expense Target</th><th className="num">Expense Actual</th>
                <th className="num">Profit Target</th><th className="num">Profit Actual</th>
                <th className="num">Achievement</th>
              </tr>
            </thead>
            <tbody>
              {data.quarters.map((q) => (
                <tr key={q.label} style={quarter && q.label === `Q${quarter}` ? { borderLeft: "3px solid var(--brand)" } : undefined}>
                  <td>{q.label}</td>
                  <td className="num">{fmtMoney(q.income_target)}</td>
                  <td className="num">{fmtMoney(q.income_actual)}</td>
                  <td className="num">{fmtMoney(q.expense_target)}</td>
                  <td className="num">{fmtMoney(q.expense_actual)}</td>
                  <td className="num">{fmtMoney(q.profit_target)}</td>
                  <td className="num">{fmtMoney(q.profit_actual)}</td>
                  <td className="num">{q.income_target ? fmtPct((q.income_actual / q.income_target) * 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.75rem" }}>
          Quarterly figures are the sum of their three months — there's no separately stored quarterly target.
          Income actual is Total Revenue as recorded by finance (may include non-brokerage income); expense
          actual is always the live total of the expense ledger for that period.
        </p>
      </div>
    </div>
  );
}

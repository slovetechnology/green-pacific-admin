import "@/shared/styles/ledger.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMinor } from "../api/ledger";

interface BudgetAccount { id: number; code: string; name: string; type: "Income" | "Expense"; section: string; retired: boolean; months: number[]; prior: number[] }
interface Grid {
  year: number; hasLines: boolean; updated: { by: string; at: string } | null; canEdit: boolean;
  accounts: BudgetAccount[]; financialsTargets: { income: (number | null)[]; expenses: (number | null)[] };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toText = (kobo: number) => (kobo ? String(kobo / 100) : "");
/** "1,250.5" -> 125050 kobo; anything unreadable counts as 0 here (the server rejects it on save). */
const toKobo = (text: string) => {
  const n = Number(String(text).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
/** Splits a year's amount into 12 whole-kobo months; the remainder goes to December. */
function spread(totalKobo: number): string[] {
  const each = Math.floor(totalKobo / 12);
  return MONTHS.map((_, i) => toText(i === 11 ? totalKobo - each * 11 : each));
}

/**
 * Budgets: a budget per income and expense account per month. When a year has budget lines, the management
 * accounts compare every line with its budget; otherwise they use the totals on Financials Performance.
 */
export function BudgetsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const year = Number(params.get("year")) || new Date().getFullYear();
  const { data, isLoading, error } = useQuery({ queryKey: ["gl", "budgets", year], queryFn: () => api.get<Grid>(`/api/gl/budgets/${year}`) });
  const [values, setValues] = useState<Record<number, string[]>>({});
  const [showAll, setShowAll] = useState(false);
  const [uplift, setUplift] = useState("0");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.accounts.map((a) => [a.id, a.months.map(toText)])));
  }, [data]);

  const dirty = useMemo(() => Boolean(data?.accounts.some((a) => (values[a.id] ?? []).some((v, i) => toKobo(v) !== a.months[i]))), [data, values]);
  const shown = (data?.accounts ?? []).filter((a) => showAll || a.months.some(Boolean) || a.prior.some(Boolean) || (values[a.id] ?? []).some((v) => toKobo(v)));
  const editable = Boolean(data?.canEdit);

  const set = (id: number, i: number, v: string) => setValues((cur) => ({ ...cur, [id]: (cur[id] ?? Array(12).fill("")).map((x, j) => (j === i ? v : x)) }));
  const rowTotal = (id: number) => (values[id] ?? []).reduce((s, v) => s + toKobo(v), 0);
  const monthTotal = (type: string, i: number) => (data?.accounts ?? []).filter((a) => a.type === type).reduce((s, a) => s + toKobo(values[a.id]?.[i] ?? ""), 0);
  const yearTotal = (type: string) => MONTHS.reduce((s, _, i) => s + monthTotal(type, i), 0);

  function fillFromLastYear() {
    const factor = 1 + (Number(uplift) || 0) / 100;
    setValues(Object.fromEntries((data?.accounts ?? []).map((a) => [a.id, a.prior.map((k) => toText(Math.round(k * factor)))])));
    setFlash({ ok: true, text: `Filled from ${year - 1}'s actual figures${Number(uplift) ? ` plus ${uplift}%` : ""}. Review, then save.` });
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setFlash(null);
    try {
      const lines = data.accounts.filter((a) => (values[a.id] ?? []).some((v, i) => toKobo(v) !== a.months[i]))
        .map((a) => ({ account_id: a.id, months: (values[a.id] ?? []).map((v) => String(v).replace(/,/g, "").trim()) }));
      const r = await api.put<{ changed: number }>(`/api/gl/budgets/${year}`, { lines });
      setFlash({ ok: true, text: `${year} budget saved (${r.changed} amount${r.changed === 1 ? "" : "s"} changed).` });
      await queryClient.invalidateQueries({ queryKey: ["gl"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "Saving failed." });
    } finally {
      setBusy(false);
    }
  }

  const groups: ["Income" | "Expense", string][] = [["Income", "Income"], ["Expense", "Expenses"]];
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Budgets</h1>
          <p className="ledger-intro">
            A budget for each income and expense account, by month. Once a year has budget lines, the{" "}
            <Link to="/ledger/management-accounts">management accounts</Link> compare every line with its budget; until then they use the
            totals on <Link to="/financials">Financials Performance</Link>. A signed-off pack keeps the budget it was signed with.
          </p>
        </div>
      </div>
      <div className="card ledger-toolbar">
        <div className="toolbar">
          <label className="ledger-field">Year
            <select value={year} onChange={(e) => { if (!dirty || window.confirm("Discard unsaved changes?")) setParams({ year: e.target.value }); }}>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="ledger-check-label"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every account</label>
          {editable && (
            <div className="ledger-toolbar-actions">
              <label className="ledger-field">Uplift on last year (%)
                <input inputMode="decimal" value={uplift} onChange={(e) => setUplift(e.target.value)} style={{ width: "6rem" }} />
              </label>
              <button type="button" className="btn btn-secondary" onClick={fillFromLastYear}>Fill from {year - 1} actuals</button>
              <button type="button" className="btn" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save budget"}</button>
            </div>
          )}
        </div>
        {data?.updated && <p className="ledger-memo">Last changed by {data.updated.by} on {String(data.updated.at).slice(0, 10)}.</p>}
      </div>
      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      {isLoading && <p>Loading…</p>}
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the budget."}</div>}
      {data && data.accounts.length === 0 && <div className="card"><p>Load the chart of accounts on <Link to="/ledger/settings">Ledger Settings</Link> first.</p></div>}
      {data && data.accounts.length > 0 && (
        <div className="card">
          {!showAll && shown.length < data.accounts.length && (
            <p className="ledger-note">Showing accounts with a budget or last year's figures. Tick "Show every account" to budget a new one.</p>
          )}
          {editable && <p className="ledger-note">Type a year total in the last column to spread it evenly across the months.</p>}
          <div className="table-wrap">
            <table className="data-grid-table ledger-statement ledger-budget">
              <thead>
                <tr><th>Account</th>{MONTHS.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Year</th></tr>
              </thead>
              <tbody>
                {groups.map(([type, title]) => (
                  <BudgetGroup key={type} title={title}>
                    {shown.filter((a) => a.type === type).map((a) => (
                      <tr key={a.id}>
                        <td><span className="ledger-code">{a.code}</span> {a.name}{a.retired && <span className="badge badge-secondary ledger-tag">Inactive</span>}</td>
                        {MONTHS.map((m, i) => (
                          <td key={m} className="num">
                            {editable
                              ? <input aria-label={`${a.code} ${m}`} inputMode="decimal" value={values[a.id]?.[i] ?? ""} onChange={(e) => set(a.id, i, e.target.value)} />
                              : fmtMinor(a.months[i])}
                          </td>
                        ))}
                        <td className="num">
                          {editable
                            ? <YearInput totalKobo={rowTotal(a.id)} label={`${a.code} year`} onSpread={(k) => setValues((cur) => ({ ...cur, [a.id]: spread(k) }))} />
                            : fmtMinor(rowTotal(a.id))}
                        </td>
                      </tr>
                    ))}
                    <tr className="ledger-subtotal">
                      <td>Total {title.toLowerCase()}</td>
                      {MONTHS.map((m, i) => <td key={m} className="num">{fmtMinor(monthTotal(type, i))}</td>)}
                      <td className="num">{fmtMinor(yearTotal(type))}</td>
                    </tr>
                  </BudgetGroup>
                ))}
                <tr className="ledger-subtotal">
                  <td><strong>Profit / (loss)</strong></td>
                  {MONTHS.map((m, i) => <td key={m} className="num"><strong>{fmtMinor(monthTotal("Income", i) - monthTotal("Expense", i))}</strong></td>)}
                  <td className="num"><strong>{fmtMinor(yearTotal("Income") - yearTotal("Expense"))}</strong></td>
                </tr>
                {data.financialsTargets.income.some((v) => v != null) && (
                  <>
                    <tr className="ledger-section-head"><th colSpan={14}>For comparison: Financials Performance targets</th></tr>
                    {(["income", "expenses"] as const).map((k) => (
                      <tr key={k}>
                        <td className="ledger-memo">{k === "income" ? "Income target" : "Expense target"}</td>
                        {data.financialsTargets[k].map((v, i) => <td key={i} className="num ledger-memo">{v == null ? "—" : fmtMinor(v)}</td>)}
                        <td className="num ledger-memo">{fmtMinor(data.financialsTargets[k].reduce<number>((s, v) => s + (v ?? 0), 0))}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
          {!data.hasLines && <p className="ledger-note">No budget lines are saved for {year} yet, so the management accounts use the Financials Performance totals.</p>}
        </div>
      )}
    </div>
  );
}

function BudgetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="ledger-section-head"><th colSpan={14}>{title}</th></tr>
      {children}
    </>
  );
}

/** The year column: shows the row total; typing a new total and leaving the cell spreads it over the months. */
function YearInput({ totalKobo, label, onSpread }: { totalKobo: number; label: string; onSpread: (kobo: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input aria-label={label} inputMode="decimal" value={text ?? toText(totalKobo)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== null && toKobo(text) !== totalKobo) onSpread(toKobo(text)); setText(null); }} />
  );
}

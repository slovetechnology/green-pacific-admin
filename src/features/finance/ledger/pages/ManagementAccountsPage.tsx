import "@/shared/styles/ledger.css";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, openApiFile } from "@/shared/api/client";
import { fmtMoneyShort } from "@/shared/lib/format";
import { fmtMinor } from "../api/ledger";

interface Amounts { actual: number | null; prior: number | null; budget?: number | null; variance?: number | null; variancePct?: number | null }
interface AccountRow { code: string; name: string; month: number; ytd: number; priorYtd: number | null; budgetMonth?: number; varianceMonth?: number; budgetYtd?: number; varianceYtd?: number }
interface IsLine { kind: "line" | "total" | "result"; type: string; label: string; month: Amounts; ytd: Amounts }
interface Figures {
  period: { year: number; month: number; label: string; monthTo: string; previousMonthEnd: string };
  notes: Record<string, string | null>;
  kpis: { key: string; label: string; value: number; budget?: number | null; prior?: number | null }[];
  ratios: Record<string, number | null>;
  incomeStatement: IsLine[];
  budgetSource?: "lines" | "totals" | null;
  revenue: { byClass: AccountRow[]; byInsurer: { name: string; month: number; ytd: number }[]; byProducer: { name: string; month: number; ytd: number }[] };
  expenses: AccountRow[];
  balanceSheet: { rows: { group: string; label: string; total?: boolean; current: number; previous: number | null; change: number | null }[]; trust: { assets: number; liabilities: number; position: number } };
  cash: { code: string; name: string; clientMoney: boolean; current: number; previous: number; change: number }[];
  production: Record<"month" | "ytd" | "priorYtd", { gwp: number; policies: number; newBusiness: number; renewals: number; endorsements: number }>;
  receivables: { asOf: string; aging: { bucket: string; amount: number; count: number }[]; total: number; overdue: number };
}
interface PackInfo { id: number; version: number; status: "Draft" | "Final"; preparedBy: string | null; preparedAt: string | null; finalisedBy: string | null; finalisedAt: string | null; sha256: string | null; revisionReason: string | null }
interface PackResponse {
  pack: PackInfo | null;
  versions: { version: number; status: string; finalised_by: string | null }[];
  figures: Figures;
  commentary: Record<string, string>;
  frozen: boolean;
  intact: boolean;
  figuresChanged: boolean | null;
}
interface ListResponse {
  packs: { year: number; month: number; version: number; status: string; label: string }[];
  sections: { key: string; label: string; help: string }[];
  can: { prepare: boolean; finalise: boolean };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (v: number | null | undefined) => (v == null ? "—" : fmtMinor(v));
const short = (v: number | null | undefined) => (v == null ? "—" : fmtMoneyShort(v / 100));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);

/** Whether a variance is good news: more income or less cost than budget. */
function tone(type: string, variance: number | null | undefined) {
  if (variance == null || variance === 0) return undefined;
  const good = type === "Expense" ? variance < 0 : variance > 0;
  return good ? "ledger-good" : "ledger-bad";
}

function defaultPeriod() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Monthly management accounts: the month and year to date against budget and last year, revenue and cost
 * analysis, balance sheet, cash and client money, production and receivables, with commentary and a Finance
 * Director sign-off that freezes the pack.
 */
export function ManagementAccountsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const def = defaultPeriod();
  const year = Number(params.get("year")) || def.year;
  const month = Number(params.get("month")) || def.month;
  const version = params.get("version") || "";
  const list = useQuery({ queryKey: ["gl", "management-accounts"], queryFn: () => api.get<ListResponse>("/api/gl/management-accounts") });
  const path = `/api/gl/management-accounts/${year}/${month}`;
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "management-accounts", year, month, version],
    queryFn: () => api.get<PackResponse>(`${path}${version ? `?version=${version}` : ""}`),
    retry: false,
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(data?.commentary ?? {}), [data?.commentary]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
      setFlash({ ok: true, text: done });
      set({ version: "" });
      await queryClient.invalidateQueries({ queryKey: ["gl", "management-accounts"] });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof ApiError ? err.message : "That did not work." });
    } finally {
      setBusy(false);
    }
  }
  const download = (format: "pdf" | "xlsx") => openApiFile(`${path}?format=${format}${version ? `&version=${version}` : ""}`)
    .catch((err) => setFlash({ ok: false, text: err instanceof ApiError ? err.message : "Download failed." }));

  const can = list.data?.can;
  const sections = list.data?.sections ?? [];
  const latest = data?.versions[0];
  const viewingLatest = !version || Number(version) === latest?.version;
  const editable = Boolean(can?.prepare && data && !data.frozen && viewingLatest);
  const thisYear = new Date().getFullYear();
  const f = data?.figures;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Management Accounts</h1>
          <p className="ledger-intro">
            A monthly pack from the ledger, against the <Link to="/ledger/budgets">budget</Link> and the same period last year. An accountant
            writes the commentary; a Finance Director who didn't write it signs it off once the month is closed, which freezes the pack.
          </p>
        </div>
      </div>

      <div className="card ledger-toolbar">
        <div className="toolbar">
          <label className="ledger-field"><span>Month</span>
            <select value={month} onChange={(e) => set({ month: e.target.value, version: "" })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="ledger-field"><span>Year</span>
            <select value={year} onChange={(e) => set({ year: e.target.value, version: "" })}>
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {data && data.versions.length > 1 && (
            <label className="ledger-field"><span>Version</span>
              <select value={version || String(latest?.version ?? "")} onChange={(e) => set({ version: e.target.value })}>
                {data.versions.map((v) => <option key={v.version} value={v.version}>v{v.version} ({v.status})</option>)}
              </select>
            </label>
          )}
          <div className="ledger-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!data} onClick={() => void download("pdf")}>PDF</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!data} onClick={() => void download("xlsx")}>Excel</button>
          </div>
        </div>
        {(list.data?.packs ?? []).length > 0 && (
          <p className="ledger-note">
            Packs: {list.data!.packs.slice(0, 12).map((p, i) => (
              <span key={`${p.year}-${p.month}`}>{i ? " · " : ""}<button type="button" className="btn-link" onClick={() => set({ year: String(p.year), month: String(p.month), version: "" })}>{p.label}</button> ({p.status === "Final" ? `final v${p.version}` : "draft"})</span>
            ))}
          </p>
        )}
      </div>

      {flash && <div className={`flash ${flash.ok ? "flash-success" : "flash-error"}`}>{flash.text}</div>}
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the pack."}</div>}
      {isLoading && <p>Building the pack…</p>}

      {data && f && (
        <>
          <div className={`card ledger-pack-status ${data.frozen ? "final" : "draft"}`}>
            <div>
              <strong>{f.period.label}</strong>{" "}
              {data.frozen
                ? <span className="badge badge-paid">Final v{data.pack?.version}</span>
                : <span className="badge badge-warning">{data.pack ? `Draft v${data.pack.version}` : "Not started"}</span>}
              <div className="ledger-memo">
                {data.frozen
                  ? `Signed off by ${data.pack?.finalisedBy} on ${String(data.pack?.finalisedAt).slice(0, 10)}. Prepared by ${data.pack?.preparedBy}. Figures frozen at sign-off.`
                  : data.pack ? `Commentary last saved by ${data.pack.preparedBy}. Figures are live from the ledger.` : "Figures are live from the ledger."}
                {data.pack?.revisionReason && ` Revision: ${data.pack.revisionReason}.`}
              </div>
              {data.frozen && data.figuresChanged && <div className="ledger-problem">The ledger for this month has changed since sign-off. Start a revision to issue an updated pack.</div>}
              {data.frozen && !data.intact && <div className="ledger-problem">This pack no longer matches its fingerprint: it has been altered outside the app.</div>}
            </div>
            <div className="toolbar">
              {editable && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => api.put(`${path}/commentary`, { commentary: draft }), "Commentary saved.")}>Save commentary</button>}
              {can?.finalise && !data.frozen && data.pack && viewingLatest && (
                <button type="button" className="btn" disabled={busy}
                  onClick={() => { if (window.confirm(`Sign off ${f.period.label}? The pack is frozen and can only be changed by a new revision.`)) void act(() => api.post(`${path}/finalise`), `${f.period.label} signed off.`); }}>
                  Sign off
                </button>
              )}
              {can?.prepare && data.frozen && viewingLatest && (
                <button type="button" className="btn btn-secondary" disabled={busy}
                  onClick={() => { const reason = window.prompt("Why is the pack being revised?"); if (reason) void act(() => api.post(`${path}/revise`, { reason }), "Revision started."); }}>
                  Revise
                </button>
              )}
            </div>
          </div>

          <div className="kpi-row">
            {f.kpis.map((k) => (
              <div key={k.key} className="card kpi-card">
                <span className="kpi-label">{k.label}</span>
                <span className={`kpi-value${k.value < 0 ? " ledger-bad" : ""}`} title={money(k.value)}>{short(k.value)}</span>
                <span className="ledger-memo">
                  {k.budget != null && <>Budget {short(k.budget)} </>}
                  {k.prior != null && <>{k.budget != null ? "· " : ""}Last year {short(k.prior)}</>}
                </span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="ledger-ratios">
              <span>Profit margin <strong>{pct(f.ratios.profitMarginYtd)}</strong></span>
              <span>Cost to income <strong>{pct(f.ratios.costToIncomeYtd)}</strong></span>
              <span>Income against budget <strong>{pct(f.ratios.budgetAchievementYtd)}</strong></span>
              <span>Income growth <strong>{pct(f.ratios.incomeGrowthYtd)}</strong></span>
              <span>Premium growth <strong>{pct(f.ratios.gwpGrowthYtd)}</strong></span>
            </div>
            <p className="ledger-note">Ratios are year to date. {Object.values(f.notes).filter(Boolean).join(" ")}</p>
          </div>

          <div className="card">
            <h2>Commentary</h2>
            {sections.map((s) => (
              <div key={s.key} className="ledger-commentary">
                <label htmlFor={`mc-${s.key}`}><strong>{s.label}</strong>{s.key === "overview" && editable ? " (required to sign off)" : ""}</label>
                {editable ? (
                  <>
                    <textarea id={`mc-${s.key}`} rows={s.key === "overview" ? 4 : 3} value={draft[s.key] ?? ""} placeholder={s.help}
                      onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
                  </>
                ) : (
                  <p className="ledger-commentary-text">{data.commentary[s.key] || <span className="ledger-memo">None.</span>}</p>
                )}
              </div>
            ))}
            {editable && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => api.put(`${path}/commentary`, { commentary: draft }), "Commentary saved.")}>Save commentary</button>}
          </div>

          <div className="card">
            <h2>Income statement</h2>
            <div className="table-wrap">
              <table className="data-grid-table ledger-statement">
                <thead>
                  <tr><th /><th className="num">Month</th><th className="num">Budget</th><th className="num">Variance</th><th className="num">Last year</th><th className="num">Year to date</th><th className="num">Budget</th><th className="num">Variance</th><th className="num">Last year</th></tr>
                </thead>
                <tbody>
                  {f.incomeStatement.map((l) => (
                    <tr key={`${l.kind}-${l.label}`} className={l.kind === "line" ? "" : l.kind === "result" ? "ledger-grand-total" : "ledger-subtotal"}>
                      <td>{l.kind === "line" ? <span style={{ paddingLeft: "1rem" }}>{l.label}</span> : <strong>{l.label}</strong>}</td>
                      <td className="num">{money(l.month.actual)}</td>
                      <td className="num">{l.month.budget === undefined ? "" : money(l.month.budget)}</td>
                      <td className={`num ${tone(l.type, l.month.variance) ?? ""}`}>{l.month.variance === undefined ? "" : money(l.month.variance)}{l.month.variancePct != null && <div className="ledger-memo">{pct(l.month.variancePct)}</div>}</td>
                      <td className="num">{money(l.month.prior)}</td>
                      <td className="num">{money(l.ytd.actual)}</td>
                      <td className="num">{l.ytd.budget === undefined ? "" : money(l.ytd.budget)}</td>
                      <td className={`num ${tone(l.type, l.ytd.variance) ?? ""}`}>{l.ytd.variance === undefined ? "" : money(l.ytd.variance)}{l.ytd.variancePct != null && <div className="ledger-memo">{pct(l.ytd.variancePct)}</div>}</td>
                      <td className="num">{money(l.ytd.prior)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {f.budgetSource !== "lines" && (
              <p className="ledger-note">
                The budget here is total income and total expenses (Financials Performance), so variances are on the totals only. Enter a budget
                for each account on <Link to="/ledger/budgets">Budgets</Link> to compare every line.
              </p>
            )}
          </div>

          <div className="ledger-two-col">
            <AccountTable title="Brokerage by class" type="Income" rows={f.revenue.byClass} lines={f.budgetSource === "lines"} />
            <SimpleTable title="Brokerage by insurer" head={["Insurer", "Month", "Year to date"]} rows={f.revenue.byInsurer.map((r) => [r.name, money(r.month), money(r.ytd)])} />
            <SimpleTable title="Brokerage by producer" head={["Producer", "Month", "Year to date"]} rows={f.revenue.byProducer.map((r) => [r.name, money(r.month), money(r.ytd)])} />
            <AccountTable title="Expenses" type="Expense" rows={f.expenses} lines={f.budgetSource === "lines"} />
          </div>

          <div className="ledger-two-col">
            <SimpleTable title={`Balance sheet at ${f.period.monthTo}`} head={["", "This month end", "Previous", "Change"]}
              rows={f.balanceSheet.rows.map((r) => [r.total ? <strong key="l">{r.label}</strong> : r.label, money(r.current), money(r.previous), money(r.change)])} />
            <SimpleTable title="Cash and client money" head={["Account", "This month end", "Previous", "Change"]}
              rows={[
                ...f.cash.map((c) => [<span key="n">{c.code} {c.name}{c.clientMoney && <span className="badge badge-warning ledger-tag">Client money</span>}</span>, money(c.current), money(c.previous), money(c.change)]),
                [<strong key="t">Client money surplus / (shortfall)</strong>, <span key="v" className={f.balanceSheet.trust.position < 0 ? "ledger-bad" : "ledger-good"}>{money(f.balanceSheet.trust.position)}</span>, "", ""],
              ]} />
            <SimpleTable title="Production" head={["", "Month", "Year to date", "Last year to date"]}
              rows={[
                ["Gross written premium", money(f.production.month.gwp), money(f.production.ytd.gwp), money(f.production.priorYtd.gwp)],
                ["Policies written", f.production.month.policies, f.production.ytd.policies, f.production.priorYtd.policies],
                ["of which new business", f.production.month.newBusiness, f.production.ytd.newBusiness, f.production.priorYtd.newBusiness],
                ["of which renewals", f.production.month.renewals, f.production.ytd.renewals, f.production.priorYtd.renewals],
                ["Endorsement notes", f.production.month.endorsements, f.production.ytd.endorsements, f.production.priorYtd.endorsements],
              ]} />
            <SimpleTable title={`Premium receivables (as of ${f.receivables.asOf})`} head={["Age", "Policies", "Owed"]}
              rows={[...f.receivables.aging.map((b) => [b.bucket, b.count, money(b.amount)]), [<strong key="t">Total</strong>, "", <strong key="v">{money(f.receivables.total)}</strong>]]} />
          </div>
        </>
      )}
    </div>
  );
}

/** An account table; with budget lines by account it adds each line's budget and variance. */
function AccountTable({ title, type, rows, lines }: { title: string; type: string; rows: AccountRow[]; lines: boolean }) {
  if (!lines) {
    return <SimpleTable title={title} head={["Account", "Month", "Year to date", "Last year to date"]}
      rows={rows.map((r) => [`${r.code} ${r.name}`, money(r.month), money(r.ytd), money(r.priorYtd)])} />;
  }
  const v = (n: number | undefined) => <span className={tone(type, n)}>{money(n)}</span>;
  return <SimpleTable wide title={title} head={["Account", "Month", "Budget", "Variance", "Year to date", "Budget", "Variance"]}
    rows={rows.map((r) => [`${r.code} ${r.name}`, money(r.month), money(r.budgetMonth), v(r.varianceMonth), money(r.ytd), money(r.budgetYtd), v(r.varianceYtd)])} />;
}

function SimpleTable({ title, head, rows, wide = false }: { title: string; head: string[]; rows: React.ReactNode[][]; wide?: boolean }) {
  return (
    <div className={`card${wide ? " ledger-wide" : ""}`}>
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="ledger-note">Nothing in this period.</p> : (
        <div className="table-wrap">
          <table className="data-grid-table ledger-statement">
            <thead><tr>{head.map((h, i) => <th key={`${i}-${h}`} className={i ? "num" : undefined}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

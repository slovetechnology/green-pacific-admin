import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "@/app/guards/RoleGate";
import { api, apiUrl } from "@/shared/api/client";

interface Line {
  key: string; label: string; bold?: boolean; section?: string | null;
  weeks: (number | null)[]; total: number; mtd: number; ytd: number;
}
interface Summary {
  title: string; weekEnded: string; month: string; date: string;
  weeks: { label: string; start: string; end: string; weekEnding: string; started: boolean }[];
  lines: Line[];
}
interface InvestmentEntry { id: number; income_date: string; source: string; description: string; amount: number }
interface InvestmentList { year: string; entries: InvestmentEntry[]; total: number }

const num = (v: number | null) =>
  v === null ? "" : Math.abs(v) < 0.005 ? "-" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCDate()}-${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}-${String(d.getUTCFullYear()).slice(2)}`;
};

const BAND = { background: "#a9d18e", color: "#0b0b0b", textAlign: "center", fontWeight: 700 } as const;

function InvestmentIncomePanel({ year, onChange }: { year: string; onChange: () => void }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ income_date: today, source: "", amount: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data } = useQuery({
    queryKey: ["investment-income", year],
    queryFn: () => api.get<InvestmentList>(`/api/investment-income?year=${year}`),
  });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["investment-income"] }); onChange(); };
  const add = useMutation({
    mutationFn: () => api.post("/api/investment-income", form),
    onSuccess: () => { setForm({ ...form, source: "", amount: "" }); setError(""); setNotice("Investment income added."); refresh(); },
    onError: (e: Error) => { setNotice(""); setError(e.message); },
  });
  // Checked here, not by the browser, so a missing field always says which one instead of the click doing nothing.
  const submit = () => {
    setNotice("");
    if (!form.income_date) return setError("Pick the date the income was received.");
    if (!form.source.trim()) return setError("Enter the source, e.g. Treasury bills.");
    if (!(Number(form.amount) > 0)) return setError("Enter an amount greater than zero.");
    setError("");
    add.mutate();
  };
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/investment-income/${id}`),
    onSuccess: () => { setError(""); setNotice(""); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="card">
      <h2>Investment income {year}</h2>
      <p className="page-lede">Interest, dividends and similar income. Each entry feeds the Investment Income row above by its date.</p>
      <RoleGate need="write">
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} aria-label="Date" />
          <input placeholder="Source (e.g. Treasury bills)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input type="number" step="0.01" min="0" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <button className="btn" type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add"}</button>
        </form>
      </RoleGate>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {notice && <div className="flash flash-success">{notice}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Source</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {(data?.entries.length ?? 0) === 0 && <tr><td colSpan={4} className="empty-state">No investment income recorded for {year}.</td></tr>}
            {data?.entries.map((e) => (
              <tr key={e.id}>
                <td>{e.income_date}</td><td>{e.source}</td><td className="num">{num(e.amount)}</td>
                <td><RoleGate need="write"><button className="btn" type="button" onClick={() => remove.mutate(e.id)}>Delete</button></RoleGate></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WeeklySummaryReportPage() {
  const [date, setDate] = useState("");
  const queryClient = useQueryClient();
  const qs = date ? `?date=${date}` : "";
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "weekly-summary", date],
    queryFn: () => api.get<Summary>(`/api/reports/weekly-summary${qs}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return null;
  const year = data.date.slice(0, 4);
  const span = data.weeks.length + 4;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Weekly Summary</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <label>Week containing <input type="date" value={date || data.date} onChange={(e) => setDate(e.target.value)} /></label>
          <a className="btn" href={apiUrl(`/api/reports/weekly-summary/pdf${qs}`)}>PDF</a>
          <a className="btn" href={apiUrl(`/api/reports/weekly-summary/excel${qs}`)}>Excel</a>
        </div>
      </div>
      <p className="page-lede">{data.month}. Weeks end on Friday; the first starts on the 1st and a short stub at either end of the month joins its neighbour.</p>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th colSpan={span} style={BAND}>{data.title}</th></tr>
              <tr>
                <th />
                {data.weeks.map((w) => <th key={w.label} className="num">{w.label}<br /><small>{shortDate(w.weekEnding)}</small></th>)}
                <th className="num">Total</th><th className="num">Month To Date</th><th className="num">Year To Date</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <Fragment key={l.key}>
                  {l.section && <tr><td colSpan={span} style={BAND}>{l.section}</td></tr>}
                  <tr style={l.bold ? { fontWeight: 700 } : undefined}>
                    <td>{l.label}</td>
                    {l.weeks.map((v, i) => <td key={i} className="num">{num(v)}</td>)}
                    <td className="num">{num(l.total)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{num(l.mtd)}</td>
                    <td className="num">{num(l.ytd)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="page-lede" style={{ marginTop: "0.75rem" }}>
          Sales is premium written and Commission is the brokerage on it. Margin is Commission less Expense. Premium Paid is the
          money received in the period, whichever week the policy was written. Premium Outstanding is Sales less Premium Paid, so it
          is negative when a period collects more than it wrote. A week that has not started is left blank.
        </p>
      </div>

      <InvestmentIncomePanel year={year} onChange={() => queryClient.invalidateQueries({ queryKey: ["reports", "weekly-summary"] })} />
    </div>
  );
}

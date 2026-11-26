import "@/shared/styles/ledger.css";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { fmtMinor } from "../api/ledger";
import { useReportFilters } from "../components/useReportFilters";
import { Kpi } from "./ProfitLossPage";

interface Dashboard {
  from: string;
  to: string;
  ledgerLive: boolean;
  trend: { month: string; gwp: number; commissionBooked: number; commissionEarned: number }[];
  aging: { bucket: string; amount: number; count: number }[];
  reconciliation: { name: string; value: number }[];
  totals: { gwp: number; commissionBooked: number; commissionEarned: number; receivables: number; overdue: number; openExceptions: number };
}

const PIE_COLOURS = ["var(--series-1)", "var(--status-critical)", "var(--series-3)", "var(--series-4)"];
const AGING_COLOURS = ["var(--series-3)", "var(--series-4)", "var(--series-2)", "var(--status-serious, var(--series-2))", "var(--status-critical)"];
const axis = { fontSize: 12, fill: "var(--text-muted)" };
const naira = (kobo: number) => kobo / 100;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Accounting KPIs: premium and commission trend, what clients owe by age, and where insurer statements stand. */
export function AccountingDashboardPage() {
  const [filters, setFilters] = useReportFilters();
  const params = { from: filters.from, to: filters.to };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "dashboard", params],
    queryFn: () => api.get<Dashboard>(`/api/gl/dashboard?${new URLSearchParams(params)}`),
  });
  const trend = (data?.trend ?? []).map((r) => ({ month: monthLabel(r.month), gwp: naira(r.gwp), booked: naira(r.commissionBooked), earned: naira(r.commissionEarned) }));
  const aging = (data?.aging ?? []).map((b) => ({ ...b, amount: naira(b.amount) }));
  const pie = (data?.reconciliation ?? []).filter((p) => p.value > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Accounting Dashboard</h1>
        </div>
      </div>
      <div className="card ledger-toolbar">
        <div className="toolbar">
          <label className="ledger-field"><span>From</span><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label className="ledger-field"><span>To</span><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <div className="ledger-toolbar-actions">
            <Link className="btn btn-secondary btn-sm" to={`/ledger/commission-tracking?from=${filters.from}&to=${filters.to}`}>Commission tracking</Link>
          </div>
        </div>
      </div>
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the dashboard."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <>
          <div className="kpi-row">
            <Kpi label="Gross written premium" value={fmtMinor(data.totals.gwp)} />
            <Kpi label="Commission earned (ledger)" value={data.ledgerLive ? fmtMinor(data.totals.commissionEarned) : "Ledger not live"} />
            <Kpi label="Premium owed by clients" value={fmtMinor(data.totals.receivables)} />
            <Kpi label="Of which overdue" value={fmtMinor(data.totals.overdue)} tone={data.totals.overdue ? "bad" : undefined} />
            <Kpi label="Open reconciliation exceptions" value={String(data.totals.openExceptions)} tone={data.totals.openExceptions ? "bad" : undefined} />
          </div>

          <div className="card">
            <h2>Gross written premium and commission</h2>
            <p className="ledger-note">
              Premium (left axis) and booked commission (right axis) by transaction date. Earned commission is what the ledger recognised: brokerage on premium
              received (No Premium, No Cover) and Direct Bill commission from reconciled statements.
              {!data.ledgerLive && " Earned commission appears once the ledger has a go-live date."}
            </p>
            <div style={{ width: "100%", height: 300 }} role="img" aria-label="Monthly gross written premium, commission booked and commission earned">
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
                  <XAxis dataKey="month" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} />
                  <YAxis yAxisId="gwp" tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={72}
                    label={{ value: "Premium", angle: -90, position: "insideLeft", style: { fontSize: 12, fill: "var(--text-muted)" } }} />
                  <YAxis yAxisId="commission" orientation="right" tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={72}
                    label={{ value: "Commission", angle: 90, position: "insideRight", style: { fontSize: 12, fill: "var(--text-muted)" } }} />
                  <Tooltip formatter={(v) => (typeof v === "number" ? fmtMoney(v) : "—")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="gwp" type="monotone" dataKey="gwp" name="Gross written premium" stroke="var(--series-1)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                  <Line yAxisId="commission" type="monotone" dataKey="booked" name="Commission booked" stroke="var(--series-4)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line yAxisId="commission" type="monotone" dataKey="earned" name="Commission earned" stroke="var(--series-2)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ledger-chart-grid">
            <div className="card">
              <h2>Premium receivables by age</h2>
              <p className="ledger-note">Agency Bill premium clients still owe today, by days past the payment due date. <Link to="/premium-invoices">Premium invoices</Link>.</p>
              <div style={{ width: "100%", height: 260 }} role="img" aria-label="Premium receivables by days past due">
                <ResponsiveContainer>
                  <BarChart data={aging} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
                    <XAxis dataKey="bucket" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} interval={0} />
                    <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
                    <Tooltip formatter={(v, _n, item) => [`${fmtMoney(v as number)} (${(item?.payload as { count: number }).count} policies)`, "Owed"]} />
                    <Bar dataKey="amount" name="Owed" radius={[3, 3, 0, 0]}>
                      {aging.map((_, i) => <Cell key={i} fill={AGING_COLOURS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h2>Insurer statement reconciliation</h2>
              <p className="ledger-note">
                <Link to="/premium-statements">Premium statements</Link> and <Link to="/commission-statements">commission statements</Link> (voided ones left out).
              </p>
              {pie.length === 0 ? <p className="ledger-note">No statements imported yet.</p> : (
                <div style={{ width: "100%", height: 260 }} role="img" aria-label="Insurer statements by reconciliation status">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={pie.length > 1 ? 2 : 0}>
                        {pie.map((p) => <Cell key={p.name} fill={PIE_COLOURS[(data.reconciliation.findIndex((r) => r.name === p.name)) % PIE_COLOURS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} statement${v === 1 ? "" : "s"}`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

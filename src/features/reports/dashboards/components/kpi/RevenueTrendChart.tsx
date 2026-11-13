import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import type { SeriesPoint } from "../../api/dashboardKpis";

// GWP as bars on the left axis, brokerage commission as a line on the right
// axis (commission is roughly a tenth of GWP, so a shared axis would flatten
// it), and last year's GWP as a dashed reference line.
export function RevenueTrendChart({ series, year, height = 280 }: { series: SeriesPoint[]; year: number; height?: number }) {
  const axis = { fontSize: 12, fill: "var(--text-muted)" };
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={`Monthly gross written premium and brokerage commission for ${year}, with ${year - 1} premium for comparison`}>
      <ResponsiveContainer>
        <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="month" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} />
          <YAxis yAxisId="gwp" tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
          <YAxis yAxisId="commission" orientation="right" tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
          <Tooltip formatter={(v) => (typeof v === "number" ? fmtMoney(v) : "—")} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="gwp" dataKey="gwp" name={`GWP ${year}`} fill="var(--series-1, var(--brand))" fillOpacity={0.85} radius={[2, 2, 0, 0]} />
          <Line yAxisId="gwp" type="monotone" dataKey="priorGwp" name={`GWP ${year - 1}`} stroke="var(--text-muted)" strokeDasharray="4 4" dot={false} strokeWidth={1.75} />
          <Line yAxisId="commission" type="monotone" dataKey="commission" name={`Commission ${year}`} stroke="var(--series-3, var(--status-warning))" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

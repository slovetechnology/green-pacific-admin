import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import type { AgingBucket } from "../../api/dashboardKpis";

const BUCKET_COLOR: Record<string, string> = {
  current: "var(--status-good)",
  d1_30: "var(--series-3, var(--status-warning))",
  d31_60: "var(--status-warning)",
  d61_90: "var(--status-critical)",
  d90_plus: "var(--status-critical)",
};

export function AgingChart({ buckets, height = 220 }: { buckets: AgingBucket[]; height?: number }) {
  const axis = { fontSize: 12, fill: "var(--text-muted)" };
  return (
    <div style={{ width: "100%", height }} role="img" aria-label="Outstanding premium by days past due">
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} />
          <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
          <Tooltip formatter={(v, _n, item) => [`${fmtMoney(v as number)} · ${(item.payload as AgingBucket).count} policies`, "Outstanding"]} />
          <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
            {buckets.map((b) => (
              <Cell key={b.key} fill={BUCKET_COLOR[b.key] ?? "var(--brand)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

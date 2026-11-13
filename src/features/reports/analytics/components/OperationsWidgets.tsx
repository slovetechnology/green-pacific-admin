import { memo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import type { AnalyticsResponse } from "../api/analytics";
import { AnalyticsCard } from "./AnalyticsCard";

interface Common {
  loading: boolean;
  stale: boolean;
}

const axis = { fontSize: 12, fill: "var(--text-muted)" };

// Deals by stage, Leads through Bound. The server already limited it to what the caller may see.
export const PipelineFunnelWidget = memo(function PipelineFunnelWidget({ pipeline, loading, stale }: Common & { pipeline: AnalyticsResponse["pipeline"] | undefined }) {
  const stages = pipeline?.stages;
  const q = pipeline?.quoteToBind;
  return (
    <AnalyticsCard eyebrow="Pipeline" title="Sales funnel" loading={loading} stale={stale} empty={!!stages && stages.every((s) => !s.count)} emptyText="No deals in the pipeline." height={220}>
      <div style={{ width: "100%", height: 240 }} role="img" aria-label="Deals by stage, from leads to bound.">
        <ResponsiveContainer>
          <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={axis} axisLine={false} tickLine={false} width={90} interval={0} />
            <Tooltip formatter={(v, _n, item) => [`${v} deals · ${fmtMoneyShort((item.payload as { value: number }).value)}`, "Deals"]} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {stages?.map((s) => (
                <Cell key={s.stage} fill={s.stage === "Won" ? "var(--series-4)" : "var(--series-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {q && (
        <p className="exec-state" role="status">
          Quote-to-bind: {q.ratePct === null ? "n/a" : `${q.ratePct.toFixed(1)}%`} ({q.bound} bound of {q.quoted} quoted)
        </p>
      )}
    </AnalyticsCard>
  );
});

// Policies expiring within the window that have no renewal quote on file yet.
export const ExpirationsWidget = memo(function ExpirationsWidget({ renewals, loading, stale }: Common & { renewals: AnalyticsResponse["renewals"] | undefined }) {
  return (
    <AnalyticsCard
      eyebrow="Operational risk"
      title={`Expiring in ${renewals?.windowDays ?? 30} days with no renewal quote`}
      loading={loading}
      stale={stale}
      empty={!!renewals && renewals.items.length === 0}
      emptyText="Every policy expiring soon has a renewal quote."
      flush
    >
      {renewals && (
        <div className="exec-table-wrap">
          <table className="exec-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Policy</th>
                <th>Insurer</th>
                <th>Expires</th>
                <th className="num">Premium</th>
              </tr>
            </thead>
            <tbody>
              {renewals.items.map((r) => (
                <tr key={r.id}>
                  <td>{r.client}</td>
                  <td>
                    <Link to={`/transactions/${r.id}`}>{r.policyNo || `#${r.id}`}</Link>
                  </td>
                  <td>{r.insurer}</td>
                  <td>
                    {r.endDate} ({r.daysLeft}d)
                  </td>
                  <td className="num">{fmtMoney(r.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="exec-state">
            {renewals.count} of {renewals.expiring} expiring policies have no renewal quote, worth {fmtMoneyShort(renewals.premium)}.
          </p>
        </div>
      )}
    </AnalyticsCard>
  );
});

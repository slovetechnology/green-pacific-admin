import { memo, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import type { RevenueForecast } from "../api/analytics";
import { AnalyticsCard } from "./AnalyticsCard";

// Next four quarters of revenue, projected from the last twelve completed quarters of bookings. History is
// drawn solid, the projection lighter with its 80% range as whiskers, so the eye never mistakes a guess for
// a booking. It follows the page's filters (class, insurer, broker...) but not the date window, because the
// quarters themselves are the time axis.

const axis = { fontSize: 12, fill: "var(--text-muted)" };

type Measure = "gwp" | "commission";
const MEASURES: { id: Measure; label: string }[] = [
  { id: "gwp", label: "Premium" },
  { id: "commission", label: "Commission" },
];

interface Props {
  forecast: RevenueForecast | null | undefined;
  loading: boolean;
  stale: boolean;
}

export const ForecastWidget = memo(function ForecastWidget({ forecast, loading, stale }: Props) {
  const [measure, setMeasure] = useState<Measure>("gwp");
  const name = MEASURES.find((m) => m.id === measure)!.label;

  const rows = useMemo(() => {
    if (!forecast) return [];
    const low = measure === "gwp" ? "gwpLow" : "commissionLow";
    const high = measure === "gwp" ? "gwpHigh" : "commissionHigh";
    return [
      ...forecast.history.map((h) => ({ label: h.label, actual: h[measure], projected: null as number | null, range: null as [number, number] | null })),
      ...forecast.projection.map((p) => ({ label: p.label, actual: null as number | null, projected: p[measure], range: [p[measure] - p[low], p[high] - p[measure]] as [number, number] })),
    ];
  }, [forecast, measure]);

  const total = forecast ? (measure === "gwp" ? forecast.totals.gwp : forecast.totals.commission) : 0;
  const growth = forecast ? (measure === "gwp" ? forecast.totals.gwpGrowthPct : forecast.totals.commissionGrowthPct) : null;
  const tabs = (
    <div className="fc-toggle" role="group" aria-label="Measure to forecast">
      {MEASURES.map((m) => (
        <button key={m.id} type="button" className={m.id === measure ? "is-active" : undefined} aria-pressed={m.id === measure} onClick={() => setMeasure(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );

  return (
    <AnalyticsCard eyebrow="Forecast" title="Revenue outlook, next four quarters" actions={tabs} loading={loading} stale={stale} empty={forecast === null} emptyText="Needs at least four quarters of booked business to project a trend." height={320}>
      {forecast && (
        <>
          <p className="exec-state fc-summary">
            Projected <strong>{fmtMoneyShort(total)}</strong> {name.toLowerCase()} over the next four quarters
            {growth !== null && (
              <>
                , <strong className={growth < 0 ? "is-crit" : "is-good"}>{growth >= 0 ? "▲" : "▼"} {Math.abs(growth).toFixed(1)}%</strong> on the last four
              </>
            )}
            .
          </p>
          <div style={{ width: "100%", height: 280 }} role="img" aria-label={`${name} by quarter: ${forecast.history.length} completed quarters, then a projection for ${forecast.projection.map((p) => `${p.label} ${fmtMoneyShort(p[measure])}`).join(", ")}.`}>
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
                <XAxis dataKey="label" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} interval={0} />
                <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  formatter={(v, key) => (v === null || v === undefined ? [] : [fmtMoney(v as number), key === "actual" ? `${name} (booked)` : `${name} (projected)`])}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "actual" ? "Booked" : "Projected")} />
                <Bar dataKey="actual" fill="var(--series-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="projected" fill="var(--series-1)" fillOpacity={0.35} stroke="var(--series-1)" strokeDasharray="4 3" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <ErrorBar dataKey="range" width={6} stroke="var(--text-muted)" strokeWidth={1.5} direction="y" />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="exec-table-wrap">
            <table className="exec-table">
              <thead>
                <tr>
                  <th scope="col">Quarter</th>
                  <th scope="col" className="num">Projected</th>
                  <th scope="col" className="num">Likely range (80%)</th>
                </tr>
              </thead>
              <tbody>
                {forecast.projection.map((p) => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    <td className="num">{fmtMoneyShort(p[measure])}</td>
                    <td className="num">
                      {fmtMoneyShort(measure === "gwp" ? p.gwpLow : p.commissionLow)} – {fmtMoneyShort(measure === "gwp" ? p.gwpHigh : p.commissionHigh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="exec-state fc-basis">
            A trend line through the last {forecast.quarters} completed quarters{forecast.seasonal ? ", adjusted for the usual quarter-to-quarter pattern" : ""}. It extends past bookings only: it does not know about the pipeline, rate changes or lost clients.
          </p>
        </>
      )}
    </AnalyticsCard>
  );
});

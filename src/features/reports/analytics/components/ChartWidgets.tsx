import { memo, useCallback, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { monthRange, useAnalyticsStore, type DimensionKey } from "../store/analyticsStore";
import type { AnalyticsResponse, RankedRow } from "../api/analytics";
import { AnalyticsCard } from "./AnalyticsCard";

// Each widget below is a thin chart over one slice of the dashboard payload. Clicking a mark writes the
// pick to the shared store (click it again to undo); the page then re-fetches and every widget re-slices.
// Marks that are not part of the current pick are dimmed, as in a Power BI visual.

const axis = { fontSize: 12, fill: "var(--text-muted)" };
const PALETTE = ["var(--series-1)", "var(--series-6)", "var(--series-4)", "var(--series-7)", "var(--series-3)", "var(--series-5)", "var(--series-2)", "var(--text-muted)"];
const DIM = 0.3;

// Recharts hands back the clicked datum either directly or under `payload`, depending on the series.
const datum = <T,>(d: unknown): T => ((d as { payload?: T }).payload ?? d) as T;

interface Common {
  loading: boolean;
  stale: boolean;
}

export const TrendWidget = memo(function TrendWidget({ series, loading, stale }: Common & { series: AnalyticsResponse["series"] | undefined }) {
  const from = useAnalyticsStore((s) => s.filters.from);
  const to = useAnalyticsStore((s) => s.filters.to);
  const setRange = useAnalyticsStore((s) => s.setRange);
  const picked = useMemo(() => series?.find((p) => {
    const [a, b] = monthRange(p.ym);
    return a === from && b === to;
  })?.ym, [series, from, to]);
  const onPick = useCallback(
    (d: unknown) => {
      const { ym } = datum<{ ym: string }>(d);
      if (ym === picked) setRange(null, null);
      else setRange(...monthRange(ym));
    },
    [picked, setRange]
  );
  return (
    <AnalyticsCard eyebrow="Growth" title="Monthly premium and commission, last 12 months" loading={loading} stale={stale} empty={!!series && series.every((p) => !p.gwp)} emptyText="No premium booked in this period.">
      <div style={{ width: "100%", height: 280 }} role="img" aria-label="Monthly gross written premium and commission. Click a month to filter the page to it.">
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="month" tick={axis} axisLine={{ stroke: "var(--gridline)" }} tickLine={false} />
            <YAxis tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} width={64} />
            <Tooltip formatter={(v, name) => [fmtMoney(v as number), name === "gwp" ? "Premium" : "Commission"]} cursor={{ fill: "var(--surface-2)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "gwp" ? "Premium" : "Commission")} />
            <Bar dataKey="gwp" radius={[3, 3, 0, 0]} cursor="pointer" onClick={onPick} isAnimationActive={false}>
              {series?.map((p) => (
                <Cell key={p.ym} fill="var(--series-1)" fillOpacity={picked && picked !== p.ym ? DIM : 1} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="commission" stroke="var(--series-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
});

export const ProductMixWidget = memo(function ProductMixWidget({ data, loading, stale }: Common & { data: AnalyticsResponse["lineOfBusiness"] | undefined }) {
  const picked = useAnalyticsStore((s) => s.filters.class);
  const toggle = useAnalyticsStore((s) => s.toggle);
  // "Other" is a fold of several lines, not a real class, so it can't be filtered on.
  const onPick = useCallback((d: unknown) => {
    const { line } = datum<{ line: string }>(d);
    if (line !== "Other") toggle("class", line);
  }, [toggle]);
  return (
    <AnalyticsCard eyebrow="Mix" title="Premium by product line" loading={loading} stale={stale} empty={!!data && data.length === 0} emptyText="No premium booked in this period.">
      <div style={{ width: "100%", height: 280 }} role="img" aria-label="Premium by product line. Click a slice to filter the page to it.">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="premium" nameKey="line" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-1)" cursor="pointer" onClick={onPick} isAnimationActive={false}>
              {data?.map((d, i) => (
                <Cell key={d.line} fill={PALETTE[i % PALETTE.length]} fillOpacity={picked && picked !== d.line ? DIM : 1} />
              ))}
            </Pie>
            <Tooltip formatter={(v, _n, item) => [`${fmtMoney(v as number)} · ${(item.payload as { policies: number }).policies} policies`, (item.payload as { line: string }).line]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
});

// Horizontal ranked bars: used for insurers and for brokers, which differ only in which filter a click
// writes and what the bar is called.
export const RankedBarWidget = memo(function RankedBarWidget({ rows, dimension, title, eyebrow, noun, loading, stale, readOnly }: Common & {
  readOnly?: boolean;
  rows: RankedRow[] | undefined;
  dimension: DimensionKey;
  title: string;
  eyebrow: string;
  noun: string;
}) {
  const picked = useAnalyticsStore((s) => s.filters[dimension]);
  const toggle = useAnalyticsStore((s) => s.toggle);
  // Insurers filter by id, brokers by name; the row carries whichever the filter needs.
  const keyOf = useCallback((r: RankedRow) => (dimension === "insurer_id" ? r.id ?? null : r.name), [dimension]);
  const onPick = useCallback((d: unknown) => { if (!readOnly) toggle(dimension, keyOf(datum<RankedRow>(d))); }, [toggle, dimension, keyOf, readOnly]);
  const height = Math.max(180, (rows?.length ?? 0) * 38 + 40);
  return (
    <AnalyticsCard eyebrow={eyebrow} title={title} loading={loading} stale={stale} empty={!!rows && rows.length === 0} emptyText={`No ${noun} premium in this period.`} height={220}>
      <div style={{ width: "100%", height }} role="img" aria-label={`${title}. Click a bar to filter the page to it.`}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmtMoneyShort(v)} tick={axis} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={120} interval={0} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
            <Tooltip formatter={(v) => [fmtMoney(v as number), "Premium"]} labelFormatter={(l) => String(l)} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="premium" radius={[0, 3, 3, 0]} cursor={readOnly ? "default" : "pointer"} onClick={onPick} isAnimationActive={false}>
              {rows?.map((r) => (
                <Cell key={r.name} fill="var(--series-6)" fillOpacity={picked !== null && picked !== keyOf(r) ? DIM : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
});

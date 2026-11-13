import type { ReactNode } from "react";

export type Tone = "good" | "warn" | "crit" | "neutral";

export interface Metric {
  key: string;
  label: string;
  value: ReactNode;
  // Full-precision figure shown on hover when `value` is abbreviated.
  title?: string;
  tone?: Tone;
  // Change against the prior period, in percent. null hides the delta.
  delta?: number | null;
  // When true a falling number is good news (e.g. outstanding balance).
  invertDelta?: boolean;
  note?: ReactNode;
}

function Delta({ pct, invert }: { pct: number | null | undefined; invert?: boolean }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const flat = Math.abs(pct) < 0.05;
  const good = invert ? pct < 0 : pct > 0;
  const tone = flat ? "neutral" : good ? "good" : "crit";
  return (
    <span className={`exec-delta is-${tone}`}>
      <span aria-hidden="true">{flat ? "→" : pct > 0 ? "▲" : "▼"}</span> {Math.abs(pct).toFixed(1)}%
      <span className="exec-delta-vs"> vs prior yr</span>
    </span>
  );
}

// One bordered band of metrics that share dividers, instead of N floating cards.
export function MetricStrip({ metrics, label }: { metrics: Metric[]; label: string }) {
  return (
    <div className="exec-metrics" role="group" aria-label={label}>
      {metrics.map((m) => (
        <div className="exec-metric" key={m.key}>
          <div className="exec-metric-label">{m.label}</div>
          <div className={`exec-metric-value is-${m.tone ?? "neutral"}`} title={m.title}>
            {m.value}
          </div>
          <div className="exec-metric-foot">
            <Delta pct={m.delta} invert={m.invertDelta} />
            {m.note && <span className="exec-metric-note">{m.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

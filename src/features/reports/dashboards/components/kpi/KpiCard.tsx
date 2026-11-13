import type { ReactNode } from "react";

export type KpiTone = "good" | "warn" | "crit" | "neutral";

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  // Full-precision figure shown on hover when `value` is abbreviated.
  title?: string;
  tone?: KpiTone;
  // Change against the same span last year. Pass one of the two.
  deltaPct?: number | null;
  deltaPts?: number | null;
  // True when a falling number is good news (churn, lapse, turnaround).
  lowerIsBetter?: boolean;
  // The prior-year figure the change is measured against, already formatted ("₦48.2M"). Shown in place of
  // the generic "prior yr" so the indicator reads "▲ 12.5% vs ₦48.2M last yr".
  priorLabel?: string;
  note?: ReactNode;
}

function Trend({ pct, pts, lowerIsBetter, priorLabel }: { pct?: number | null; pts?: number | null; lowerIsBetter?: boolean; priorLabel?: string }) {
  const n = pct ?? pts;
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const flat = Math.abs(n) < 0.05;
  const good = lowerIsBetter ? n < 0 : n > 0;
  const tone = flat ? "neutral" : good ? "good" : "crit";
  const unit = pct !== null && pct !== undefined ? "%" : " pts";
  const word = flat ? "unchanged" : n > 0 ? "up" : "down";
  return (
    <span className={`exec-delta is-${tone}`} aria-label={`${word} ${Math.abs(n).toFixed(1)}${unit === "%" ? " percent" : " points"} versus ${priorLabel ? `${priorLabel} ` : ""}prior year`}>
      <span aria-hidden="true">{flat ? "→" : n > 0 ? "▲" : "▼"}</span> {Math.abs(n).toFixed(1)}
      {unit}
      <span className="exec-delta-vs"> vs {priorLabel ? `${priorLabel} last yr` : "prior yr"}</span>
    </span>
  );
}

export function KpiCard({ label, value, title, tone = "neutral", deltaPct, deltaPts, lowerIsBetter, priorLabel, note }: KpiCardProps) {
  return (
    <div className="kpi-card-x">
      <div className="exec-metric-label">{label}</div>
      <div className={`exec-metric-value is-${tone}`} title={title}>
        {value}
      </div>
      <div className="exec-metric-foot">
        <Trend pct={deltaPct} pts={deltaPts} lowerIsBetter={lowerIsBetter} priorLabel={priorLabel} />
        {note && <span className="exec-metric-note">{note}</span>}
      </div>
    </div>
  );
}

// Same footprint as a KpiCard, so the page doesn't shift when data arrives.
export function KpiCardSkeleton() {
  return (
    <div className="kpi-card-x" aria-hidden="true">
      <div className="kpi-skel" style={{ width: "55%", height: "0.7rem" }} />
      <div className="kpi-skel" style={{ width: "75%", height: "1.6rem" }} />
      <div className="kpi-skel" style={{ width: "45%", height: "0.7rem" }} />
    </div>
  );
}

export function KpiGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="kpi-grid" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function KpiGridSkeleton({ count }: { count: number }) {
  return (
    <div className="kpi-grid" role="status" aria-label="Loading KPIs">
      {Array.from({ length: count }, (_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PanelSkeleton({ height = 220 }: { height?: number }) {
  return <div className="kpi-skel" style={{ width: "100%", height }} aria-hidden="true" />;
}

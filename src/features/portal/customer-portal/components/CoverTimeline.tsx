import { fmtMoney } from "@/shared/lib/format";
import { fmtDate } from "./format";
import { coverStatus } from "./StatusPill";

interface TimelinePolicy {
  id: number;
  class: string;
  policyNo: string;
  sumInsured: number;
  endDate: string | null;
  lifecycle: string;
}

const MONTH_MS = 86_400_000 * 30.44;

/**
 * The dashboard hero. Insurance is a set of time windows, so the first thing
 * a customer sees is every policy drawn against the next twelve months with
 * a marker on today — a bar ending near that marker is a renewal about to
 * be missed.
 */
export function CoverTimeline({ policies }: { policies: TimelinePolicy[] }) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const span = 12 * MONTH_MS;
  const pct = (d: string | number | Date) => Math.max(0, Math.min(100, ((new Date(d).getTime() - start.getTime()) / span) * 100));
  const nowPct = pct(Date.now());

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = new Date(start);
    m.setMonth(m.getMonth() + i);
    return m.toLocaleString("en-NG", { month: "short" });
  });

  const totalSumInsured = policies.reduce((s, p) => s + (p.sumInsured ?? 0), 0);
  const statuses = policies.map((p) => coverStatus(p.lifecycle, p.endDate));
  const needsAttention = statuses.filter((s) => s !== "active").length;

  return (
    <section className="cp-panel cp-hero">
      <div className="cp-hero-top">
        <div>
          <h2>
            Your cover through {months[11]} {start.getFullYear() + 1}
          </h2>
          <p>
            Each bar runs to the date that policy expires.{" "}
            {needsAttention > 0
              ? `${needsAttention} ${needsAttention === 1 ? "policy needs" : "policies need"} your attention.`
              : "Everything is in force."}
          </p>
        </div>
        <div className="cp-figure">
          <div className="cp-k">Total sum insured</div>
          <div className="cp-v cp-num">{fmtMoney(totalSumInsured)}</div>
        </div>
      </div>

      <div className="cp-tl-months" aria-hidden="true">
        {months.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>

      {policies.length === 0 && <div className="cp-empty">No policies on file yet.</div>}

      {policies.map((p, i) => {
        const status = statuses[i];
        const lapsed = status === "lapsed";
        const end = p.endDate ? pct(p.endDate) : nowPct;
        const left = lapsed ? 0 : nowPct;
        const width = Math.max(1.2, (lapsed ? nowPct : end) - left);
        return (
          <div className="cp-tl-row" key={p.id}>
            <div className="cp-tl-label">
              {p.class}
              <i>{p.policyNo}</i>
            </div>
            <div
              className="cp-tl-track"
              role="img"
              aria-label={`${p.class}, ${lapsed ? "expired" : "expires"} ${fmtDate(p.endDate)}`}
            >
              <div className={`cp-tl-bar cp-tl-bar--${status}`} style={{ left: `${left}%`, width: `${width}%` }}>
                {lapsed ? "" : fmtDate(p.endDate)}
              </div>
              <div className="cp-tl-now" style={{ left: `${nowPct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

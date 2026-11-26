import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { Panel } from "@/shared/components/exec/Panel";
import type { ExecutiveKpis } from "../../api/dashboardKpis";
import { KpiCard, KpiGrid } from "./KpiCard";

// The chart library is about 380 KB; loading it after the cards means the headline figures show first.
const RevenueTrendChart = lazy(() => import("./RevenueTrendChart").then((m) => ({ default: m.RevenueTrendChart })));
const AgingChart = lazy(() => import("./AgingChart").then((m) => ({ default: m.AgingChart })));
const chartFallback = (height: number) => <div className="chart-loading" style={{ height }} aria-label="Loading chart" />;

// Seven headline cards, five book-health cards (formerly the portfolio explorer), then the
// premium/commission trend and receivables aging. Anything deeper lives in the Sales Manager view.
export function ExecutiveView({ data, year }: { data: ExecutiveKpis; year: number }) {
  const ue = data.unitEconomics;
  const op = data.operating;
  const overdueTone = data.aging.over60Pct !== null && data.aging.over60Pct > 30 ? "crit" : data.aging.over60Pct !== null && data.aging.over60Pct > 15 ? "warn" : "neutral";
  return (
    <>
      <KpiGrid label="Executive summary">
        <KpiCard
          label="Gross written premium"
          value={fmtMoneyShort(data.gwp.value)}
          title={fmtMoney(data.gwp.value)}
          deltaPct={data.gwp.deltaPct}
          priorLabel={fmtMoneyShort(data.gwp.prior)}
          note={`${fmtMoneyShort(data.avgPremiumPerAccount.value)} avg / account · ${data.avgPremiumPerAccount.accounts.toLocaleString()} accounts`}
        />
        <KpiCard
          label="Brokerage commission"
          value={fmtMoneyShort(data.commission.value)}
          title={fmtMoney(data.commission.value)}
          tone="good"
          deltaPct={data.commission.deltaPct}
          priorLabel={fmtMoneyShort(data.commission.prior)}
          note={`${fmtMoneyShort(data.commission.realised)} received`}
        />
        <KpiCard
          label="Organic growth"
          value={data.organicGrowth.valuePct !== null ? fmtPct(data.organicGrowth.valuePct) : "n/a"}
          tone={data.organicGrowth.valuePct !== null && data.organicGrowth.valuePct < 0 ? "crit" : "good"}
          note={data.organicGrowth.fromNewClientsPct !== null ? `${data.organicGrowth.fromNewClientsPct.toFixed(1)} pts from new clients` : `no ${year - 1} commission to compare`}
        />
        <KpiCard
          label="Premium receivable"
          value={fmtMoneyShort(data.aging.total)}
          title={fmtMoney(data.aging.total)}
          tone={overdueTone}
          note={data.aging.over60Pct !== null ? `${fmtPct(data.aging.over60Pct)} over 60 days` : "nothing outstanding"}
        />
        <KpiCard
          label="Renewal persistency"
          value={data.persistency.valuePct !== null ? fmtPct(data.persistency.valuePct) : "n/a"}
          deltaPts={data.persistency.deltaPts}
          note={data.renewal.expired ? `${data.renewal.renewed} of ${data.renewal.expired} expiries renewed` : "no expiries yet"}
        />
        <KpiCard
          label="Weighted pipeline"
          value={fmtMoneyShort(data.pipeline.weightedValue)}
          title={fmtMoney(data.pipeline.weightedValue)}
          note={`${data.pipeline.openCount} open deals · ${fmtMoneyShort(data.pipeline.openValue)} premium`}
        />
        <KpiCard
          label="CLTV : CAC"
          value={ue.cltvToCac !== null ? `${ue.cltvToCac.toFixed(1)}×` : "n/a"}
          tone={ue.cltvToCac === null ? "neutral" : ue.cltvToCac >= 3 ? "good" : "warn"}
          note={ue.cac !== null ? `CLTV ${fmtMoneyShort(ue.cltv)} · CAC ${fmtMoneyShort(ue.cac)}` : "no campaign spend recorded"}
        />
      </KpiGrid>

      <KpiGrid label="Book health">
        <KpiCard
          label="Active policies"
          value={op.activePolicies.toLocaleString()}
          note={`${op.activeClients.toLocaleString()} clients with cover`}
        />
        <KpiCard
          label="Collection rate"
          value={op.collectionRatePct !== null ? fmtPct(op.collectionRatePct) : "n/a"}
          deltaPts={op.collectionDeltaPts}
          tone={op.collectionRatePct !== null && op.collectionRatePct < 70 ? "warn" : "neutral"}
          note="premium collected vs due"
        />
        <KpiCard
          label="Lapse rate"
          value={op.lapse.lapseRatePct !== null ? fmtPct(op.lapse.lapseRatePct) : "n/a"}
          tone={op.lapse.lapseRatePct !== null && op.lapse.lapseRatePct > 5 ? "crit" : "neutral"}
          note={`${op.lapse.cancelled} cancelled of ${op.lapse.inForce.toLocaleString()} in force`}
        />
        <KpiCard
          label="Net profit margin"
          value={op.netProfitMarginPct !== null ? fmtPct(op.netProfitMarginPct) : "n/a"}
          tone={op.netProfitMarginPct !== null && op.netProfitMarginPct < 0 ? "crit" : "good"}
          note={`${fmtMoneyShort(op.netIncome)} net income`}
        />
        <KpiCard
          label="Renewals needing action"
          value={op.renewalsDue.total.toLocaleString()}
          tone={op.renewalsDue.overdue > 0 ? "crit" : op.renewalsDue.urgent > 0 ? "warn" : "neutral"}
          note={`${op.renewalsDue.overdue} overdue · ${op.renewalsDue.urgent} in 14 days · ${op.renewalsDue.upcoming} in 60 days`}
        />
      </KpiGrid>

      <div className="exec-grid exec-grid-2-1">
        <Panel
          eyebrow="Revenue"
          title="Premium vs commission by month"
          actions={
            <Link className="exec-link" to="/reports/annual-report">
              Annual report →
            </Link>
          }
        >
          <Suspense fallback={chartFallback(280)}><RevenueTrendChart series={data.series} year={year} /></Suspense>
        </Panel>
        <Panel
          eyebrow="Collections"
          title="Premium collection aging"
          actions={
            <Link className="exec-link" to="/reports/premium-age">
              Age analysis →
            </Link>
          }
        >
          <Suspense fallback={chartFallback(220)}><AgingChart buckets={data.aging.buckets} /></Suspense>
        </Panel>
      </div>
    </>
  );
}

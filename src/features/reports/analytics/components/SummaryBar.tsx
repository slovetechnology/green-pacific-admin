import { memo, useMemo } from "react";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { KpiCard, KpiGrid, KpiGridSkeleton, type KpiCardProps } from "@/features/reports/dashboards/components/kpi/KpiCard";
import type { AnalyticsResponse } from "../api/analytics";

function lossTone(pct: number | null) {
  if (pct === null) return "neutral" as const;
  return pct > 70 ? ("crit" as const) : pct > 55 ? ("warn" as const) : ("good" as const);
}

// The six headline figures, declared as data so there is exactly one place a KPI is defined.
function summaryCards(d: AnalyticsResponse): (KpiCardProps & { id: string })[] {
  const k = d.kpis;
  return [
    { id: "gwp", label: "Gross written premium", value: fmtMoneyShort(k.gwp.value), title: fmtMoney(k.gwp.value), deltaPct: k.gwp.deltaPct },
    { id: "new", label: "New policies sold", value: k.newPolicies.value.toLocaleString(), deltaPct: k.newPolicies.deltaPct, note: "new client / new policy" },
    { id: "active", label: "Active policies", value: k.activePolicies.value.toLocaleString(), deltaPct: k.activePolicies.deltaPct, note: "in force, original policies" },
    { id: "commission", label: "Net brokerage revenue", value: fmtMoneyShort(k.commission.value), title: fmtMoney(k.commission.value), tone: "good", deltaPct: k.commission.deltaPct },
    {
      id: "loss",
      label: "Loss / claim ratio",
      value: k.lossRatio.valuePct !== null ? fmtPct(k.lossRatio.valuePct) : "n/a",
      tone: lossTone(k.lossRatio.valuePct),
      deltaPts: k.lossRatio.deltaPts,
      lowerIsBetter: true,
      note: `${fmtMoneyShort(k.lossRatio.incurred)} incurred · ${k.lossRatio.claimCount} claims`,
    },
    {
      id: "q2b",
      label: "Quote-to-bind",
      value: d.pipeline.quoteToBind.ratePct !== null ? fmtPct(d.pipeline.quoteToBind.ratePct) : "n/a",
      note: `${d.pipeline.quoteToBind.bound} bound of ${d.pipeline.quoteToBind.quoted} quoted`,
    },
    {
      id: "renewals",
      label: "Renewals rate",
      value: k.renewalRate.valuePct !== null ? fmtPct(k.renewalRate.valuePct) : "n/a",
      deltaPts: k.renewalRate.deltaPts,
      note: k.renewalRate.expired ? `${k.renewalRate.renewed} of ${k.renewalRate.expired} renewed · ${d.renewals.count} due in ${d.renewals.windowDays}d` : `${d.renewals.count} due in ${d.renewals.windowDays}d`,
    },
  ];
}

export const SummaryBar = memo(function SummaryBar({ data }: { data: AnalyticsResponse | undefined }) {
  const cards = useMemo(() => (data ? summaryCards(data) : []), [data]);
  if (!data) return <KpiGridSkeleton count={7} />;
  return (
    <KpiGrid label="Analytics summary">
      {cards.map(({ id, ...card }) => (
        <KpiCard key={id} {...card} />
      ))}
    </KpiGrid>
  );
});

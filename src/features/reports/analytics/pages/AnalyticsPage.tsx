import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { filterParams, refreshAnalytics, useAnalytics } from "../api/analytics";
import { useAnalyticsStore } from "../store/analyticsStore";
import { FilterBar } from "../components/FilterBar";
import { SummaryBar } from "../components/SummaryBar";
import { ProductMixWidget, RankedBarWidget, TrendWidget } from "../components/ChartWidgets";
import { ExpirationsWidget, PipelineFunnelWidget } from "../components/OperationsWidgets";
import { ConcentrationWidget, StateMapWidget } from "../components/GeographyWidgets";
import { ForecastWidget } from "../components/ForecastWidget";
import { ClientHeatmapWidget } from "../components/ClientHeatmapWidget";
import { PolicyTable } from "../components/PolicyTable";
import "@/shared/styles/executive.css";
import "@/shared/styles/kpi.css";
import "../analytics.css";

// Layout only: filter bar, summary bar, a grid of chart widgets, one detail table. All figures come
// from one request (useAnalytics); every widget reads and writes the shared filter store.
export function AnalyticsPage() {
  const queryClient = useQueryClient();
  const filters = useAnalyticsStore((s) => s.filters);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isFetching, error } = useAnalytics(filters);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await refreshAnalytics(filters);
      queryClient.setQueryData(["analytics-dashboard", filterParams(filters).toString()], fresh);
    } finally {
      setRefreshing(false);
    }
  }, [filters, queryClient]);

  const forbidden = error instanceof ApiError && error.status === 403;
  const stale = isFetching && !isLoading;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Green Pacific Insurance Brokers Ltd</span>
          <h1>Analytics</h1>
        </div>
        {data && (
          <div className="exec-meta">
            <span>
              {data.window.from} → {data.window.to}
            </span>
          </div>
        )}
      </header>

      <FilterBar options={data?.options} access={data?.access} window={data?.window} generatedAt={data?.generatedAt} cached={data?.cached} refreshing={refreshing} onRefresh={refresh} />

      {data?.sample && (
        <p className="exec-state is-warn" role="status">
          <strong>Sample data.</strong> No policies are recorded yet, so every figure below is illustrative and not real business.
        </p>
      )}
      {forbidden && <p className="exec-state is-crit">Analytics isn't available to your role.</p>}
      {error && !forbidden && <p className="exec-state is-crit">Could not load analytics. Check the backend is running and try again.</p>}

      {!forbidden && (
        <>
          <SummaryBar data={data} />

          <div className="an-grid">
            <div className="an-span-2">
              <TrendWidget series={data?.series} loading={isLoading} stale={stale} />
            </div>
            <ProductMixWidget data={data?.lineOfBusiness} loading={isLoading} stale={stale} />
            {data?.access.leaderboard === "self" ? (
              <RankedBarWidget rows={data.brokers} dimension="broker" eyebrow="You" title="My performance benchmarks" noun="your" readOnly loading={isLoading} stale={stale} />
            ) : (
              <RankedBarWidget rows={data?.brokers} dimension="broker" eyebrow="Brokers" title="Producer leaderboard" noun="broker" loading={isLoading} stale={stale} />
            )}
            <PipelineFunnelWidget pipeline={data?.pipeline} loading={isLoading} stale={stale} />
            <RankedBarWidget rows={data?.topCarriers} dimension="insurer_id" eyebrow="Insurers" title="Top 5 insurers by premium" noun="insurer" loading={isLoading} stale={stale} />
          </div>

          <div className="an-grid">
            <StateMapWidget geography={data?.geography} loading={isLoading} stale={stale} />
            <div className="an-span-2">
              <ConcentrationWidget geography={data?.geography} loading={isLoading} stale={stale} />
            </div>
          </div>

          <ForecastWidget forecast={data?.forecast} loading={isLoading} stale={stale} />

          <ClientHeatmapWidget heatmap={data?.clientHeatmap} loading={isLoading} stale={stale} />

          <ExpirationsWidget renewals={data?.renewals} loading={isLoading} stale={stale} />
          <PolicyTable />
        </>
      )}
    </div>
  );
}

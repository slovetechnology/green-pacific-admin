import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { ApiError } from "@/shared/api/client";
import { refreshDashboardKpis, useDashboardKpis, type KpiView } from "../api/dashboardKpis";
import { ExecutiveView } from "../components/kpi/ExecutiveView";
import { ManagerView } from "../components/kpi/ManagerView";
import { SubBrokerWidget } from "@/features/partners/sub-brokers/components/SubBrokerWidget";
import { ProducerView } from "../components/kpi/ProducerView";
import { KpiGridSkeleton, PanelSkeleton } from "../components/kpi/KpiCard";
import { Panel } from "@/shared/components/exec/Panel";
import "@/shared/styles/executive.css";
import "@/shared/styles/kpi.css";

const VIEW_LABEL: Record<KpiView, string> = {
  executive: "Executive summary",
  manager: "Sales manager",
  producer: "My book",
};

const VIEW_TITLE: Record<KpiView, string> = {
  executive: "Executive overview",
  manager: "Team performance",
  producer: "My dashboard",
};

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i);

function LoadingSkeleton({ view }: { view: KpiView | null }) {
  return (
    <>
      <KpiGridSkeleton count={view === "executive" || view === null ? 7 : 4} />
      <div className="exec-grid exec-grid-2-1">
        <Panel title="Loading…">
          <PanelSkeleton height={260} />
        </Panel>
        <Panel title="Loading…">
          <PanelSkeleton height={260} />
        </Panel>
      </div>
    </>
  );
}

// Say why the dashboard did not load, in words a user can act on.
function loadErrorReason(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Please sign in again.";
    if (error.status === 502 || error.status === 503) return "The server is starting up or busy. Wait a moment and try again.";
    if (error.status === 504) return "The server took too long to work out the figures. Try again in a minute.";
    return `The server answered: ${error.message} (error ${error.status}).`;
  }
  return "The server could not be reached. Check your internet connection and try again.";
}

export function KpiDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);

  const requestedView = params.get("view") as KpiView | null;
  const year = Number(params.get("year")) || null;
  const { data, isLoading, error, refetch, isFetching } = useDashboardKpis(requestedView, year);

  // The server decides which views exist for this login; the toggle only
  // offers those, and an agent has exactly one.
  const view = data?.view ?? requestedView;
  const allowed = data?.allowedViews ?? [];

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "view") next.delete("tab");
    setParams(next, { replace: true });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const fresh = await refreshDashboardKpis(requestedView, year);
      queryClient.setQueryData(["dashboard-kpis", requestedView, year], fresh);
    } catch {
      // Show the failure through the query's own error state, with its reason.
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const forbidden = error instanceof ApiError && error.status === 403;
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  const isStaff = user && !user.isAgent;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Green Pacific Insurance Brokers Ltd</span>
          <h1>{view ? VIEW_TITLE[view] : "Dashboard"}</h1>
        </div>
        <div className="exec-meta" aria-label="Session context">
          <span>{today}</span>
          {data && (
            <span>
              {data.window.from} → {data.window.to}
            </span>
          )}
          <span className="exec-chip">{user?.role}</span>
        </div>
        <div className="exec-header-actions">
          {user?.canWrite && (
            <Link className="btn btn-sm" to="/transactions/new">
              + New transaction
            </Link>
          )}
        </div>
      </header>

      {(allowed.length > 1 || isStaff) && (
        <div className="exec-filters kpi-controls">
          {allowed.length > 1 && (
            <div className="kpi-switch" role="group" aria-label="Dashboard view">
              {allowed.map((v) => (
                <button key={v} type="button" className={v === view ? "is-active" : undefined} aria-pressed={v === view} onClick={() => setParam("view", v)}>
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          )}
          <label className="exec-filter">
            <span>Year</span>
            <select value={data?.year ?? year ?? THIS_YEAR} onChange={(e) => setParam("year", e.target.value === String(THIS_YEAR) ? "" : e.target.value)}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === THIS_YEAR ? " (year to date)" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="kpi-freshness" role="status">
            {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${data.cached ? " (cached)" : ""}` : ""}
          </span>
          {isStaff && (
            <button type="button" className="exec-filter-clear kpi-refresh" onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
          )}
        </div>
      )}

      {(isLoading || (isFetching && !data)) && <LoadingSkeleton view={view} />}
      {forbidden && <p className="exec-state is-crit">That view isn't available to your role.</p>}
      {error && !forbidden && !isFetching && (
        <div className="exec-state is-crit" role="alert">
          <p>Could not load the dashboard. {loadErrorReason(error)}</p>
          <button type="button" className="btn btn-sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      )}

      {data?.executive && <ExecutiveView data={data.executive} year={data.year} />}
      {(data?.executive || data?.sales) && <SubBrokerWidget />}
      {data?.sales && data.retention && data.operations && <ManagerView sales={data.sales} retention={data.retention} operations={data.operations} />}
      {data?.producer && <ProducerView data={data.producer} />}
    </div>
  );
}

import { memo, type ReactNode } from "react";
import { Panel } from "@/shared/components/exec/Panel";
import { PanelSkeleton } from "@/features/reports/dashboards/components/kpi/KpiCard";

interface Props {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  // True until the first response arrives. Later reloads keep the old figures on screen.
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  // Dims the body while a re-sliced response is on its way.
  stale?: boolean;
  flush?: boolean;
  height?: number;
  children: ReactNode;
}

// The one container every widget on the Analytics page sits in: header, loading skeleton, empty state
// and the "refreshing" dim all live here, so a widget only has to draw its own content.
export const AnalyticsCard = memo(function AnalyticsCard({ title, eyebrow, actions, loading, empty, emptyText = "Nothing to show for these filters.", stale, flush, height = 260, children }: Props) {
  return (
    <Panel title={title} eyebrow={eyebrow} actions={actions} flush={flush}>
      <div className={stale ? "an-body is-stale" : "an-body"} aria-busy={stale || loading || undefined}>
        {loading ? <PanelSkeleton height={height} /> : empty ? <p className="exec-state">{emptyText}</p> : children}
      </div>
    </Panel>
  );
});

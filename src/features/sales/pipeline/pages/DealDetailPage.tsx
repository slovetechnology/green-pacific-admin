import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import { WinDialog } from "../components/WinDialog";
import { ActivityTab } from "../components/tabs/ActivityTab";
import { CommissionTab } from "../components/tabs/CommissionTab";
import { DocumentsTab } from "../components/tabs/DocumentsTab";
import { OverviewTab } from "../components/tabs/OverviewTab";
import { MarketsTab } from "../components/tabs/MarketsTab";
import { QuotesTab } from "../components/tabs/QuotesTab";
import { RiskTab } from "../components/tabs/RiskTab";
import { OPEN_STAGES, STAGES, isStaffDetail, tabForWhere, type AgentDealDetail, type DealDetail, type FormOptions } from "../lib/types";

const TAB_IDS = ["overview", "risk", "markets", "quotes", "documents", "activity", "commission"];

export function DealDetailPage() {
  const { dealId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [winning, setWinning] = useState(false);
  const [focus, setFocus] = useState<{ code: string; n: number } | null>(null);


  const { data, isLoading, isError } = useQuery({ queryKey: ["deals", String(dealId)], queryFn: () => api.get<DealDetail | AgentDealDetail>(`/api/deals/${dealId}`) });
  const { data: options } = useQuery({ queryKey: ["deals", "form-options"], queryFn: () => api.get<FormOptions>("/api/deals/meta/form-options"), enabled: Boolean(user && !user.isAgent) });

  if (isLoading) return <p>Loading…</p>;
  if (isError || !data) return <p>Deal not found. <Link to="/deals">Back to the pipeline</Link></p>;
  if (!isStaffDetail(data)) return <AgentDeal data={data} />;

  const detail = data;
  const { deal } = detail;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["deals"] });
  };
  const tabParam = params.get("tab") ?? "overview";
  const tab = TAB_IDS.includes(tabParam) ? tabParam : "overview";
  function goTo(id: string) {
    const next = new URLSearchParams(params);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
  }

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview" },
    { id: "risk", label: "Risk / Slip", count: detail.slips.length || undefined },
    { id: "markets", label: "Markets" },
    { id: "quotes", label: "Quotes", count: detail.quotes.length || undefined },
    { id: "documents", label: "Documents", count: detail.documents.length || undefined },
    { id: "activity", label: "Activity", count: detail.activities.length || undefined },
    { id: "commission", label: "Commission" },
  ];
  const tabProps = {
    detail, options, canWrite: Boolean(user?.canWrite), isAdmin: Boolean(user?.isAdmin), refresh,
    onWin: () => setWinning(true), goTo, focus,
  };
  const next = detail.nextAction;
  const currentIndex = STAGES.indexOf(deal.stage);

  function runNext() {
    if (!next) return;
    if (next.ready) {
      if (next.stage === "Won") setWinning(true);
      else void api.post(`/api/deals/${deal.id}/transition`, { to_stage: next.stage }).then(refresh).catch(() => goTo("overview"));
      return;
    }
    // Open the tab that holds the missing item, then point at it. Without the focus the button
    // did nothing visible when that tab (usually Overview) was already open.
    const target = tabForWhere(next.where);
    goTo(target);
    if (target !== "overview") window.setTimeout(() => document.getElementById("deal-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    setFocus((f) => ({ code: next.code, n: (f?.n ?? 0) + 1 }));
  }

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow"><Link to={`/clients/${deal.client_id}`}>{deal.client_name}</Link></span>
          <h1>{deal.deal_name}</h1>
        </div>
        <div className="exec-meta">
          <StatusBadge status={deal.stage} />
          <span className="exec-chip">{deal.deal_type}</span>
          {deal.class_of_business && <span className="exec-chip">{deal.class_of_business}</span>}
          <span>{fmtMoney(deal.estimated_premium)}</span>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <Link className="btn btn-outline btn-sm" to={`/tasks/new?entity_type=deal&entity_id=${deal.id}`}>+ Add task</Link>
          </div>
        </RoleGate>
      </header>

      <ol className="pl-stages" aria-label="Stage">
        {STAGES.filter((s) => OPEN_STAGES.includes(s) || s === deal.stage || s === (deal.stage === "Lost" ? "Lost" : "Won")).map((s) => {
          const i = STAGES.indexOf(s);
          const classes = [s === deal.stage ? "is-current" : i < currentIndex && deal.stage !== "Lost" ? "is-done" : "", s === "Lost" ? "is-lost" : "", s === "Won" ? "is-won" : ""].filter(Boolean).join(" ");
          return <li key={s} className={classes} aria-current={s === deal.stage ? "step" : undefined}>{s}</li>;
        })}
      </ol>

      {next && !deal.archived_at && (
        <div className={next.ready ? "pl-next-card is-ready" : "pl-next-card"}>
          <p>
            <b>{next.ready ? `Ready: ${next.label}` : `Next: ${next.label}`}</b>
            {next.ready ? `This deal meets everything needed for ${next.stage}.` : next.message}
          </p>
          {tabProps.canWrite && <button type="button" className="btn btn-sm" onClick={runNext}>{next.ready ? next.label : "Take me there"}</button>}
        </div>
      )}

      <section id="deal-workspace" className="exec-workspace" aria-label="Deal workspace">
        <Tabs tabs={tabs} active={tab} onChange={goTo} idPrefix="deal" label="Deal sections" />
        {tab === "overview" && <OverviewTab {...tabProps} />}
        {tab === "risk" && <RiskTab {...tabProps} />}
        {tab === "markets" && <MarketsTab {...tabProps} />}
        {tab === "quotes" && <QuotesTab {...tabProps} />}
        {tab === "documents" && <DocumentsTab {...tabProps} />}
        {tab === "activity" && <ActivityTab {...tabProps} />}
        {tab === "commission" && <CommissionTab {...tabProps} />}
      </section>

      <WinDialog dealId={deal.id} open={winning} onClose={() => setWinning(false)} onDone={refresh} />
    </div>
  );
}

// What an agent may see of a deal they introduced.
function AgentDeal({ data }: { data: AgentDealDetail }) {
  const { deal, history } = data;
  const rows = history.map((h, i) => ({ id: i, ...h }));
  const columns: DataGridColumn<(typeof rows)[number]>[] = [
    { key: "stage", header: "Stage", render: (h) => <StatusBadge status={h.to_stage} /> },
    { key: "when", header: "From", render: (h) => h.entered_at.slice(0, 10) },
  ];
  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">{deal.client_name}</span>
          <h1>{deal.deal_name}</h1>
        </div>
        <div className="exec-meta"><StatusBadge status={deal.stage} /><span className="exec-chip">{deal.deal_type}</span></div>
      </header>
      <dl className="detail-grid">
        <div><dt className="k">Class of business</dt><dd className="v" style={{ margin: 0 }}>{deal.class_of_business || "—"}</dd></div>
        <div><dt className="k">Estimated premium</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(deal.estimated_premium)}</dd></div>
        <div><dt className="k">Expected close</dt><dd className="v" style={{ margin: 0 }}>{deal.expected_close_date || "—"}</dd></div>
        <div><dt className="k">Subject matter</dt><dd className="v" style={{ margin: 0 }}>{deal.subject_matter || "—"}</dd></div>
      </dl>
      <DataGrid columns={columns} rows={rows} isLoading={false} getRowKey={(h) => h.id} emptyMessage="No history yet." />
      <p><Link to="/deals">Back to my deals</Link></p>
    </div>
  );
}

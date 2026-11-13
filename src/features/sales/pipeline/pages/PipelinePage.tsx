import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import "@/shared/styles/pipeline.css";
import { Board } from "../components/Board";
import { GateNotice } from "../components/GateNotice";
import { MoveDialog, type MoveRequest } from "../components/MoveDialog";
import { QuickCreateDialog } from "../components/QuickCreateDialog";
import { WinDialog } from "../components/WinDialog";
import {
  daysSince, daysUntil, dealLink, describeError, isStale, missingOf, moveKind, OPEN_STAGES, STAGES,
  type AgentDealRow, type DealRow, type FormOptions, type GateItem, type ListResponse, type Stage,
} from "../lib/types";

const FILTER_KEYS = ["owner", "class", "insurer", "source", "type", "q", "min", "max", "expiry", "stage"] as const;

function buildQuery(params: URLSearchParams, board: boolean): string {
  const q = new URLSearchParams();
  const map: [string, string][] = [["owner", "owner"], ["class", "class"], ["insurer", "insurer_id"], ["source", "source"], ["type", "deal_type"], ["q", "q"], ["min", "min_value"], ["max", "max_value"], ["stage", "stage"]];
  for (const [from, to] of map) if (params.get(from)) q.set(to, params.get(from)!);
  if (params.get("mine") === "1") q.set("mine", "1");
  if (params.get("stale") === "1") q.set("stale", "1");
  const days = Number(params.get("expiry"));
  if (days > 0) q.set("expiry_before", new Date(Date.now() + days * 86400000).toISOString().slice(0, 10));
  if (board) q.set("with_next", "1");
  return q.toString();
}

export function PipelinePage({ openCreate = false }: { openCreate?: boolean }) {
  const { user } = useAuth();
  if (user?.isAgent) return <AgentPipeline />;
  return <StaffPipeline openCreate={openCreate} />;
}

function StaffPipeline({ openCreate }: { openCreate: boolean }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const view = params.get("view") === "list" ? "list" : "board";
  const [creating, setCreating] = useState(openCreate);
  const [winId, setWinId] = useState<number | null>(null);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [blocked, setBlocked] = useState<{ deal: DealRow; to: Stage; message: string; items: GateItem[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = buildQuery(params, view === "board");
  const { data, isLoading } = useQuery({ queryKey: ["deals", "list", query], queryFn: () => api.get<ListResponse>(`/api/deals?${query}`) });
  const { data: options } = useQuery({ queryKey: ["deals", "form-options"], queryFn: () => api.get<FormOptions>("/api/deals/meta/form-options") });

  const deals = data?.deals ?? [];
  const staleDays = data?.staleDays ?? 14;
  const canWrite = Boolean(user?.canWrite);
  const filterCount = FILTER_KEYS.filter((k) => params.get(k)).length + (params.get("mine") === "1" ? 1 : 0) + (params.get("stale") === "1" ? 1 : 0);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  function clearFilters() {
    const next = new URLSearchParams();
    if (view === "list") next.set("view", "list");
    setParams(next, { replace: true });
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["deals"] });

  async function requestMove(deal: DealRow, to: Stage) {
    setNotice(null);
    setBlocked(null);
    const kind = moveKind(deal.stage, to);
    if (!kind) {
      setNotice(`A deal can't move from ${deal.stage} to ${to}.`);
      return;
    }
    if (to === "Won") {
      setWinId(deal.id);
      return;
    }
    if (kind !== "forward") {
      setMove({ deal, to, kind });
      return;
    }
    try {
      await api.post(`/api/deals/${deal.id}/transition`, { to_stage: to });
      setNotice(`${deal.deal_name} moved to ${to}.`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 422 || err.status === 409)) {
        setBlocked({ deal, to, message: describeError(err), items: missingOf(err) });
      } else {
        setNotice(describeError(err));
      }
    }
  }

  const columns: DataGridColumn<DealRow>[] = [
    { key: "deal", header: "Deal", render: (d) => <Link to={dealLink(d.id)}>{d.deal_name}</Link> },
    { key: "client", header: "Client", render: (d) => <Link to={`/clients/${d.client_id}`}>{d.client_name}</Link> },
    { key: "class", header: "Class", render: (d) => d.class_of_business || "—" },
    { key: "stage", header: "Stage", render: (d) => <StatusBadge status={d.stage} /> },
    { key: "owner", header: "Owner", render: (d) => d.owner_name || "Unassigned" },
    { key: "premium", header: "Est. premium", align: "right", render: (d) => fmtMoney(d.estimated_premium) },
    { key: "weighted", header: "Expected brokerage", align: "right", render: (d) => fmtMoney(d.weighted_value) },
    { key: "expiry", header: "Expiry", render: (d) => <span className="nowrap">{d.x_date || "—"}</span> },
    { key: "age", header: "In stage", align: "right", render: (d) => { const n = daysSince(d.stage_entered_at ?? d.created_at); return n === null ? "—" : `${n}d`; } },
  ];

  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const won = deals.filter((d) => d.stage === "Won");
  const atRisk = open.filter((d) => isStale(d, staleDays) || (d.x_date !== null && (daysUntil(d.x_date) ?? 999) <= 30)).length;
  const openPremium = open.reduce((sum, d) => sum + (Number(d.estimated_premium) || 0), 0);
  const metrics: Metric[] = [
    { key: "open", label: "Open deals", value: open.length },
    { key: "premium", label: "Open est. premium", value: fmtMoneyShort(openPremium), title: fmtMoney(openPremium) },
    { key: "expected", label: "Expected brokerage", value: fmtMoneyShort(data?.openTotal ?? 0), title: fmtMoney(data?.openTotal ?? 0), tone: "good", note: "Premium × rate × stage probability" },
    { key: "won", label: "Won (in view)", value: won.length, tone: "good" },
    { key: "risk", label: "At risk", value: atRisk, tone: atRisk ? "warn" : "neutral", note: `Stale ${staleDays}d+ or expiring within 30d` },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Sales &amp; Pipeline</span>
          <h1>Pipeline</h1>
        </div>
        <div className="exec-header-actions">
          <div className="pl-toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "board"} onClick={() => setParam("view", "")}>Board</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setParam("view", "list")}>List</button>
          </div>
          <RoleGate need="write">
            <Link className="btn btn-secondary btn-sm" to="/deals/import">Upload leads</Link>
            <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>+ New deal</button>
          </RoleGate>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Pipeline summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Pipeline filters">
        <label className="exec-search">
          <span>Search</span>
          <input type="search" value={params.get("q") ?? ""} onChange={(e) => setParam("q", e.target.value)} placeholder="Deal or client" />
        </label>
        <Select label="Owner" value={params.get("owner")} onChange={(v) => setParam("owner", v)} options={options?.owners.map((o) => [String(o.id), o.username])} />
        <Select label="Class" value={params.get("class")} onChange={(v) => setParam("class", v)} options={options?.classes.map((c) => [c, c])} />
        <Select label="Insurer" value={params.get("insurer")} onChange={(v) => setParam("insurer", v)} options={options?.insurers.map((i) => [String(i.id), i.name])} />
        <Select label="Source" value={params.get("source")} onChange={(v) => setParam("source", v)} options={options?.sources.map((s) => [s, s])} />
        <Select label="Type" value={params.get("type")} onChange={(v) => setParam("type", v)} options={[["New", "New business"], ["Renewal", "Renewal"]]} />
        {view === "list" && <Select label="Stage" value={params.get("stage")} onChange={(v) => setParam("stage", v)} options={STAGES.map((s) => [s, s])} />}
        <Select label="Expiring" value={params.get("expiry")} onChange={(v) => setParam("expiry", v)} options={[["30", "Within 30 days"], ["60", "Within 60 days"], ["120", "Within 120 days"]]} />
        <label className="exec-filter">
          <span>Min premium</span>
          <input type="number" min="0" value={params.get("min") ?? ""} onChange={(e) => setParam("min", e.target.value)} />
        </label>
        <label className="exec-filter">
          <span>Max premium</span>
          <input type="number" min="0" value={params.get("max") ?? ""} onChange={(e) => setParam("max", e.target.value)} />
        </label>
        <label className="pl-check"><input type="checkbox" checked={params.get("mine") === "1"} onChange={(e) => setParam("mine", e.target.checked ? "1" : "")} /> My deals</label>
        <label className="pl-check"><input type="checkbox" checked={params.get("stale") === "1"} onChange={(e) => setParam("stale", e.target.checked ? "1" : "")} /> Stale only</label>
        {filterCount > 0 && <button type="button" className="exec-filter-clear" onClick={clearFilters}>Clear {filterCount} filter{filterCount === 1 ? "" : "s"}</button>}
      </form>

      <div aria-live="polite">
        {notice && <div className="pl-notice is-good" role="status">{notice} <button type="button" className="btn-link" onClick={() => setNotice(null)}>Dismiss</button></div>}
        {blocked && (
          <GateNotice
            title={`${blocked.deal.deal_name} can't move to ${blocked.to} yet`}
            message={blocked.items.length ? undefined : blocked.message}
            items={blocked.items}
            dealId={blocked.deal.id}
            onDismiss={() => setBlocked(null)}
          />
        )}
      </div>

      {isLoading ? (
        <p className="exec-state">Loading…</p>
      ) : view === "board" ? (
        <Board
          deals={deals}
          canWrite={canWrite}
          staleDays={staleDays}
          onRequestMove={requestMove}
          onShowAll={(stage) => { const next = new URLSearchParams(params); next.set("view", "list"); next.set("stage", stage); setParams(next, { replace: true }); }}
        />
      ) : (
        <DataGrid
          columns={columns}
          rows={deals}
          isLoading={isLoading}
          getRowKey={(d) => d.id}
          onRowClick={(d) => navigate(dealLink(d.id))}
          emptyMessage="No deals match. Clear a filter, or start one with “New deal”."
        />
      )}

      <QuickCreateDialog
        open={creating}
        options={options}
        initialClientId={params.get("client_id") ?? undefined}
        onClose={() => { setCreating(false); if (openCreate) navigate("/deals", { replace: true }); }}
        onCreated={refresh}
      />
      <WinDialog dealId={winId} open={winId !== null} onClose={() => setWinId(null)} onDone={refresh} />
      <MoveDialog request={move} lossReasons={options?.lossReasons ?? []} onClose={() => setMove(null)} onDone={() => { setMove(null); void refresh(); }} />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string) => void; options: [string, string][] | undefined }) {
  return (
    <label className="exec-filter">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {(options ?? []).map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </label>
  );
}

// An agent sees the deals they own or introduced, as a plain list: where each
// one stands, nothing about earnings or notes.
function AgentPipeline() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["deals", "agent-list"], queryFn: () => api.get<{ deals: AgentDealRow[] }>("/api/deals") });
  const columns: DataGridColumn<AgentDealRow>[] = [
    { key: "deal", header: "Deal", render: (d) => <Link to={dealLink(d.id)}>{d.deal_name}</Link> },
    { key: "client", header: "Client", render: (d) => d.client_name },
    { key: "class", header: "Class", render: (d) => d.class_of_business || "—" },
    { key: "stage", header: "Stage", render: (d) => <StatusBadge status={d.stage} /> },
    { key: "premium", header: "Est. premium", align: "right", render: (d) => fmtMoney(d.estimated_premium) },
    { key: "close", header: "Expected close", render: (d) => d.expected_close_date || "—" },
  ];
  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">My business</span>
          <h1>My deals</h1>
        </div>
      </header>
      <p className="page-lede">Deals you own or introduced. You can see where each one stands; the team handles the rest.</p>
      <DataGrid columns={columns} rows={data?.deals} isLoading={isLoading} getRowKey={(d) => d.id} onRowClick={(d) => navigate(dealLink(d.id))} emptyMessage="No deals yet." />
    </div>
  );
}

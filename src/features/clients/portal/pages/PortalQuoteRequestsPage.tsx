import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import { fmtMoney } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import { POLICY_STATUS_LABELS, QUOTE_STATUS_LABELS, providerName, shortDate, type PortalRequestRow } from "../api";

// A submitted request with no Pipeline deal yet (the customer had no client record): staff open it from the request
// page. Not while it waits for the KYC (its deal opens when the KYC is verified).
const needsDeal = (r: PortalRequestRow) => r.status === "submitted" && r.review_status === "New" && r.quote?.status !== "awaiting_kyc";

// "Needs action" is what staff must do: get a quote the insurer could not give online, place a paid policy, or open
// the deal for a request that got none (these requests are no longer in the quote request inbox).
const VIEWS: { key: string; label: string; query: string; keep?: (r: PortalRequestRow) => boolean }[] = [
  { key: "", label: "All", query: "" },
  { key: "action", label: "Needs action", query: "status=submitted", keep: (r) => r.quote?.status === "awaiting_staff" || r.policy?.status === "awaiting_staff" || needsDeal(r) },
  { key: "draft", label: "Unfinished drafts", query: "status=draft" },
  { key: "idle", label: "Drafts idle 3+ days", query: "status=draft&idle_days=3" },
  { key: "submitted", label: "Submitted", query: "status=submitted" },
  { key: "abandoned", label: "Discarded", query: "status=abandoned" },
];

function stage(r: PortalRequestRow) {
  if (r.status !== "submitted") return null;
  if (needsDeal(r) && r.quote?.status !== "awaiting_staff" && r.policy?.status !== "awaiting_staff") return "Sales: open the deal";
  if (r.policy) return `Policy: ${POLICY_STATUS_LABELS[r.policy.status] ?? r.policy.status}`;
  if (r.quote) return `Quote: ${QUOTE_STATUS_LABELS[r.quote.status] ?? r.quote.status}`;
  return null;
}

export function PortalQuoteRequestsPage() {
  const [params, setParams] = useSearchParams();
  const viewKey = params.get("view") ?? "action";
  const view = VIEWS.find((v) => v.key === viewKey) ?? VIEWS[0];

  const { data, isLoading } = useQuery({
    queryKey: ["portal-quote-requests", view.query],
    queryFn: () => api.get<{ data: PortalRequestRow[] }>(`/api/customer-quote-requests${view.query ? `?${view.query}` : ""}`),
  });
  const rows = (data?.data ?? []).filter((r) => (view.keep ? view.keep(r) : true));
  const search = useRowSearch(rows, (r) => [r.reference, r.customer?.name, r.customer?.email, r.customer?.phone, r.product.name]);

  const columns: DataGridColumn<PortalRequestRow>[] = [
    { key: "activity", header: "Last activity", render: (r) => <span className="nowrap">{shortDate(r.last_activity_at)}</span> },
    {
      key: "customer", header: "Customer",
      render: (r) => (
        <Link to={`/portal/quote-requests/${r.id}`}>
          {r.customer?.name ?? "—"}
          <div className="muted small">{r.customer?.email}</div>
        </Link>
      ),
    },
    { key: "product", header: "Product", render: (r) => <>{r.product.name}<div className="muted small">{providerName(r.product.source)}</div></> },
    { key: "reference", header: "Reference", render: (r) => r.reference ?? <span className="muted">Draft · {r.sections_complete}/{r.sections_total} steps</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "stage", header: "Stage", render: (r) => stage(r) ?? (r.status === "abandoned" ? r.abandon_reason ?? "—" : "—") },
    { key: "premium", header: "Premium", align: "right", render: (r) => (r.quote?.premium ? fmtMoney(r.quote.premium) : "—") },
    { key: "idle", header: "Idle", align: "right", render: (r) => (r.status === "draft" && r.idle_days !== null ? `${r.idle_days} d` : "—") },
    { key: "followups", header: "Follow-ups", align: "right", render: (r) => r.follow_up_count || "—" },
  ];

  const all = data?.data ?? [];
  const metrics: Metric[] = [
    { key: "shown", label: view.label, value: rows.length },
    { key: "quote", label: "Need our quote", value: all.filter((r) => r.quote?.status === "awaiting_staff").length, tone: all.some((r) => r.quote?.status === "awaiting_staff") ? "warn" : "neutral" },
    { key: "policy", label: "Paid, policy to place", value: all.filter((r) => r.policy?.status === "awaiting_staff").length, tone: all.some((r) => r.policy?.status === "awaiting_staff") ? "warn" : "neutral" },
    { key: "deal", label: "No deal yet", value: all.filter(needsDeal).length, tone: all.some(needsDeal) ? "warn" : "neutral" },
    { key: "issued", label: "Policies issued", value: all.filter((r) => r.policy?.status === "issued").length, tone: "good" },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer portal</span>
          <h1>Portal Quote Requests</h1>
          <p className="page-lede">
            Quote requests customers start in the portal, from unfinished drafts (to follow up) to the insurer&apos;s quote, payment and the policy.
          </p>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Portal quote request summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Portal quote request filters">
        <label className="exec-filter">
          <span>Show</span>
          <select value={view.key} onChange={(e) => { const next = new URLSearchParams(params); next.set("view", e.target.value); setParams(next); }}>
            {VIEWS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Customer, email, phone, reference or product…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage="No portal quote requests here." />
    </div>
  );
}

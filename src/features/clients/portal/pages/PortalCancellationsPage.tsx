import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import "@/shared/styles/executive.css";
import { shortDate } from "../api";

export type CancellationStatus = "pending" | "awaiting_insurer" | "cancelled" | "declined" | "withdrawn";
export const CANCELLATION_STATUS_LABELS: Record<CancellationStatus, string> = {
  pending: "To review",
  awaiting_insurer: "Cancelling with insurer",
  cancelled: "Cancelled",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
const STATUSES = Object.keys(CANCELLATION_STATUS_LABELS) as CancellationStatus[];

interface Row {
  id: number;
  reference: string;
  status: CancellationStatus;
  reason: string;
  created_at: string | null;
  reviewed_at: string | null;
  policy: { id: number; policy_no: string | null; class_of_business: string | null; end_date: string | null } | null;
  customer: { id: number; name: string; email: string } | null;
}

export function PortalCancellationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";
  const { data, isLoading } = useQuery({
    queryKey: ["portal-cancellations", status],
    queryFn: () => api.get<{ requests: Row[] }>(`/api/customer-cancellations${status ? `?status=${status}` : ""}`),
  });
  const rows = data?.requests ?? [];
  const search = useRowSearch(rows, (r) => [r.reference, r.policy?.policy_no, r.customer?.name, r.customer?.email, r.reason]);

  const columns: DataGridColumn<Row>[] = [
    { key: "date", header: "Asked", render: (r) => <span className="nowrap">{shortDate(r.created_at)}</span> },
    { key: "reference", header: "Reference", render: (r) => <Link to={`/portal/cancellations/${r.id}`}>{r.reference}</Link> },
    { key: "customer", header: "Customer", render: (r) => <>{r.customer?.name ?? "—"}<div className="muted small">{r.customer?.email}</div></> },
    { key: "policy", header: "Policy", render: (r) => (r.policy ? <Link to={`/transactions/${r.policy.id}`}>{r.policy.policy_no || `#${r.policy.id}`}<div className="muted small">{r.policy.class_of_business}</div></Link> : "—") },
    { key: "reason", header: "Reason", render: (r) => <span title={r.reason}>{r.reason.length > 60 ? `${r.reason.slice(0, 60)}…` : r.reason}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={CANCELLATION_STATUS_LABELS[r.status] ?? r.status} /> },
  ];
  const metrics: Metric[] = [
    { key: "count", label: status ? CANCELLATION_STATUS_LABELS[status as CancellationStatus] ?? status : "All requests", value: rows.length, tone: (status === "pending" || status === "awaiting_insurer") && rows.length ? "warn" : "neutral" },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer portal</span>
          <h1>Policy Cancellations</h1>
          <p className="page-lede">
            Customers ask to cancel a policy from the portal. Approve it to cancel with the insurer (online for Emple policies within 30 days of the start; otherwise cancel with the insurer and confirm here), or decline it with the reason the customer sees.
          </p>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Cancellation summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Cancellation filters">
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => { const next = new URLSearchParams(params); next.set("status", e.target.value); setParams(next); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{CANCELLATION_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Reference, policy, customer or reason…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage="No cancellation requests here." />
    </div>
  );
}

import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import "@/shared/styles/executive.css";
import { dateTime } from "../api";

// Contact Us enquiries sent from the website (backend: modules/portal/customer-enquiries). Every enquiry starts
// Pending (needs attention) until someone marks it Resolved.

export type EnquiryStatus = "pending" | "resolved";
// The badge text doubles as its CSS class (badge-pending / badge-resolved).
export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = { pending: "Pending", resolved: "Resolved" };

export interface EnquiryRow {
  id: number;
  reference: string;
  customer_user_id: number | null;
  full_name: string;
  email: string;
  phone: string | null;
  topic: string;
  policy_reference: string | null;
  message: string;
  status: EnquiryStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  last_replied_at: string | null;
  created_at: string | null;
  reply_count: number;
}

export function PortalEnquiriesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";
  const { data, isLoading } = useQuery({
    queryKey: ["portal-enquiries", status],
    queryFn: () => api.get<{ enquiries: EnquiryRow[]; counts: Record<EnquiryStatus, number> }>(`/api/customer-enquiries${status ? `?status=${status}` : ""}`),
  });
  const rows = data?.enquiries ?? [];
  const search = useRowSearch(rows, (r) => [r.reference, r.full_name, r.email, r.phone, r.topic, r.policy_reference, r.message]);

  const columns: DataGridColumn<EnquiryRow>[] = [
    { key: "date", header: "Received", render: (r) => <span className="nowrap">{dateTime(r.created_at)}</span> },
    { key: "reference", header: "Reference", render: (r) => <Link to={`/portal/enquiries/${r.id}`}>{r.reference}</Link> },
    {
      key: "from", header: "From", render: (r) => (
        <>
          {r.full_name}
          {r.customer_user_id ? <span className="muted small"> · portal customer</span> : null}
          <div className="muted small">{r.email}</div>
        </>
      ),
    },
    { key: "topic", header: "Topic", render: (r) => r.topic },
    { key: "message", header: "Message", render: (r) => <span title={r.message}>{r.message.length > 70 ? `${r.message.slice(0, 70)}…` : r.message}</span> },
    { key: "replies", header: "Replies", render: (r) => (r.reply_count ? <>{r.reply_count}<div className="muted small">last {dateTime(r.last_replied_at)}</div></> : <span className="muted">None yet</span>) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={ENQUIRY_STATUS_LABELS[r.status] ?? r.status} /> },
  ];

  const pending = data?.counts?.pending ?? 0;
  const metrics: Metric[] = [
    { key: "pending", label: "Needs attention", value: pending, tone: pending ? "warn" : "good" },
    { key: "resolved", label: "Resolved", value: data?.counts?.resolved ?? 0, tone: "neutral" },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer portal</span>
          <h1>Contact Enquiries</h1>
          <p className="page-lede">
            Messages sent from the website's Contact Us form. Open one to reply (the reply is emailed to the sender) and mark it resolved once it has been dealt with. New enquiries are Pending until then.
          </p>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Enquiry summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Enquiry filters">
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => { const next = new URLSearchParams(params); next.set("status", e.target.value); setParams(next); }}>
            <option value="">All</option>
            <option value="pending">Pending (needs attention)</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Reference, name, email, topic or message…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage={status === "pending" ? "Nothing needs attention." : "No enquiries here."} />
    </div>
  );
}

import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import "@/shared/styles/executive.css";
import { PAYMENT_STATUS_LABELS, dateTime, shortDate, type PaymentStatus, type PortalPayment } from "../api";

const STATUSES: PaymentStatus[] = ["pending", "initiated", "approved", "rejected", "cancelled"];

export function PortalPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";

  const { data, isLoading } = useQuery({
    queryKey: ["portal-payments", status],
    queryFn: () => api.get<{ data: PortalPayment[] }>(`/api/customer-payments${status ? `?status=${status}` : ""}`),
  });
  const rows = data?.data ?? [];
  const search = useRowSearch(rows, (p) => [p.reference, p.payer_reference, p.payer_name, p.customer?.name, p.customer?.email, p.quote_request.reference]);

  const columns: DataGridColumn<PortalPayment>[] = [
    { key: "date", header: "Started", render: (p) => <span className="nowrap">{shortDate(p.created_at)}</span> },
    { key: "reference", header: "Reference", render: (p) => <Link to={`/portal/payments/${p.id}`}>{p.reference}</Link> },
    { key: "customer", header: "Customer", render: (p) => <>{p.customer?.name ?? "—"}<div className="muted small">{p.customer?.email}</div></> },
    { key: "request", header: "For", render: (p) => <Link to={`/portal/quote-requests/${p.quote_request.id}`}>{p.quote_request.reference ?? `#${p.quote_request.id}`}<div className="muted small">{p.quote_request.product_name}</div></Link> },
    { key: "amount", header: "Amount", align: "right", render: (p) => fmtMoney(p.amount) },
    { key: "method", header: "Method", render: (p) => p.method.name },
    { key: "payer", header: "Bank reference", render: (p) => p.payer_reference ?? "—" },
    { key: "proof", header: "Proof", render: (p) => (p.proof ? dateTime(p.proof.uploaded_at) : "—") },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={PAYMENT_STATUS_LABELS[p.status] ?? p.status} /> },
  ];

  const total = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const metrics: Metric[] = [
    { key: "count", label: status ? PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status : "All payments", value: rows.length, tone: status === "pending" && rows.length ? "warn" : "neutral" },
    { key: "amount", label: "Amount", value: fmtMoneyShort(total), title: fmtMoney(total) },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer portal</span>
          <h1>Portal Payments</h1>
          <p className="page-lede">
            Customers pay their quote by bank transfer and upload the receipt. Check it against the bank statement, then approve it (the policy is issued and booked) or reject it with the reason.
          </p>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Portal payment summary" />

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Portal payment filters">
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => { const next = new URLSearchParams(params); next.set("status", e.target.value); setParams(next); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Reference, bank reference, customer or request…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(p) => p.id} emptyMessage="No payments here." />
    </div>
  );
}

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

  // Every payment is loaded once and split by status here, so each tab shows its count and an approved payment
  // stays one click away (it leaves "To check" once reviewed).
  const { data, isLoading } = useQuery({
    queryKey: ["portal-payments", "all"],
    queryFn: () => api.get<{ data: PortalPayment[] }>("/api/customer-payments"),
  });
  const all = data?.data ?? [];
  const rows = status ? all.filter((p) => p.status === status) : all;
  const countOf = (s: string) => all.filter((p) => p.status === s).length;
  const choose = (next: string) => { const q = new URLSearchParams(params); q.set("status", next); setParams(q); };
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

      <div className="exec-tabs" role="tablist" aria-label="Payment status">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={`exec-tab${status === s ? " is-active" : ""}`} onClick={() => choose(s)}>
            {PAYMENT_STATUS_LABELS[s]} <span className="exec-tab-count">{countOf(s)}</span>
          </button>
        ))}
        <button type="button" role="tab" aria-selected={status === ""} className={`exec-tab${status === "" ? " is-active" : ""}`} onClick={() => choose("")}>
          All <span className="exec-tab-count">{all.length}</span>
        </button>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Reference, bank reference, customer or request…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(p) => p.id} emptyMessage="No payments here." />
    </div>
  );
}

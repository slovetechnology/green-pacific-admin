import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import "@/shared/styles/executive.css";
import { dateTime } from "../api";

interface Entry {
  id: number;
  at: string;
  actor: string;
  by: "customer" | "staff" | "system";
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string | null;
  ip_address: string | null;
  user_agent: string | null;
  label: string | null;
  customer: { id: number; name: string; email: string } | null;
}
interface Page { entries: Entry[]; page: number; page_size: number; total: number }

const ENTITY_LABELS: Record<string, string> = {
  customer_user: "Account", customer_password: "Password", customer_password_reset: "Password reset", kyc_submission: "KYC",
  customer_quote_request: "Quote request", customer_payment: "Payment", claim: "Claim", customer_cancellation_request: "Cancellation",
  transaction: "Policy", receipt: "Receipt", quote_request: "Inbox request", policy_event: "Policy event",
};
const BY_LABELS: Record<Entry["by"], string> = { customer: "Customer", staff: "Staff", system: "System" };

// Every customer portal action from the audit log: what customers did (sign-ins, failed sign-ins, KYC, quotes,
// payments, claims, renewals, cancellations) and what staff or the system did to their records.
export function PortalActivityPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next);
  };
  const query = new URLSearchParams();
  for (const k of ["customer_user_id", "entity_type", "action", "actor", "from", "to", "q", "page"]) if (get(k)) query.set(k, get(k));

  const { data, isLoading } = useQuery({
    queryKey: ["portal-activity", query.toString()],
    queryFn: () => api.get<Page>(`/api/customer-portal-activity?${query.toString()}`),
  });
  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const columns: DataGridColumn<Entry>[] = [
    { key: "at", header: "When", render: (e) => <span className="nowrap">{dateTime(e.at)}</span> },
    {
      key: "customer", header: "Customer",
      render: (e) => (e.customer
        ? <button type="button" className="btn-link" onClick={() => set("customer_user_id", String(e.customer!.id))} title="Show only this customer">{e.customer.name}<div className="muted small">{e.customer.email}</div></button>
        : "—"),
    },
    { key: "by", header: "By", render: (e) => <>{BY_LABELS[e.by]}{e.by !== "customer" && <div className="muted small">{e.actor}</div>}</> },
    { key: "what", header: "What", render: (e) => <>{e.label ?? `${ENTITY_LABELS[e.entity_type] ?? e.entity_type}: ${e.action}`}<div className="muted small">{e.summary}</div></> },
    { key: "ip", header: "IP / device", render: (e) => (e.ip_address ? <span title={e.user_agent ?? undefined}>{e.ip_address}</span> : "—") },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Customer portal</span>
          <h1>Portal Activity</h1>
          <p className="page-lede">
            The customer portal's audit trail: what customers did, including sign-ins and failed sign-ins with their IP, and what staff and the system did to their KYC, quotes, payments, policies, renewals and cancellations. Click a customer to see only their trail.
          </p>
        </div>
      </header>

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Activity filters">
        {get("customer_user_id") && (
          <label className="exec-filter">
            <span>Customer</span>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => set("customer_user_id", "")}>#{get("customer_user_id")} ✕</button>
          </label>
        )}
        <label className="exec-filter">
          <span>About</span>
          <select value={get("entity_type")} onChange={(e) => set("entity_type", e.target.value)}>
            <option value="">Everything</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="exec-filter">
          <span>By</span>
          <select value={get("actor")} onChange={(e) => set("actor", e.target.value)}>
            <option value="">Anyone</option>
            <option value="customer">Customers</option>
            <option value="staff">Staff and system</option>
          </select>
        </label>
        <label className="exec-filter">
          <span>Action</span>
          <select value={get("action")} onChange={(e) => set("action", e.target.value)}>
            <option value="">Any</option>
            <option value="sign_in">Sign-in</option>
            <option value="sign_in_failed">Failed sign-in</option>
            <option value="sign_out">Sign-out</option>
            <option value="submit">Submitted</option>
            <option value="approve">Approved</option>
            <option value="reject">Rejected</option>
            <option value="review">Reviewed (KYC)</option>
            <option value="renew">Renewal</option>
            <option value="cancel">Cancelled</option>
          </select>
        </label>
        <label className="exec-filter"><span>From</span><input type="date" value={get("from")} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="exec-filter"><span>To</span><input type="date" value={get("to")} onChange={(e) => set("to", e.target.value)} /></label>
        <label className="exec-filter"><span>Search</span><input type="search" value={get("q")} placeholder="Summary or email" onChange={(e) => set("q", e.target.value)} /></label>
      </form>

      <DataGrid columns={columns} rows={data?.entries ?? []} isLoading={isLoading} getRowKey={(e) => e.id} emptyMessage="No activity matches." />
      {data && data.total > data.page_size && (
        <div className="form-actions">
          <button type="button" className="btn-secondary btn btn-sm" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</button>
          <span className="muted small">Page {page} of {pages} · {data.total} entries</span>
          <button type="button" className="btn-secondary btn btn-sm" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</button>
        </div>
      )}
    </div>
  );
}

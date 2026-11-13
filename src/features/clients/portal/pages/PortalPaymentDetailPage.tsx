import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, openApiFile } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { PAYMENT_STATUS_LABELS, POLICY_STATUS_LABELS, dateTime, type PortalPaymentDetail } from "../api";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function PortalPaymentDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-payment", id],
    queryFn: () => api.get<{ data: PortalPaymentDetail }>(`/api/customer-payments/${id}`),
    refetchInterval: (q) => (q.state.data?.data.policy_detail?.status === "issuing" ? 5000 : false),
  });

  async function review(kind: "approve" | "reject", e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(kind);
    try {
      const res = await api.post<{ message: string }>(`/api/customer-payments/${id}/${kind}`, kind === "approve" ? { note } : { reason });
      setNotice(res.message);
      setNote("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["portal-payment", id] });
      await queryClient.invalidateQueries({ queryKey: ["portal-payments"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openProof() {
    setError(null);
    try {
      await openApiFile(`/api/customer-payments/${id}/proof`, { newTab: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The file could not be opened.");
    }
  }

  if (isLoading) return <p>Loading…</p>;
  const p = data?.data;
  if (!p) return <p>Payment not found.</p>;
  const reviewable = p.status === "pending" || p.status === "initiated";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/portal/payments">Portal Payments</Link> · {p.reference}</p>
          <h1>{fmtMoney(p.amount)} from {p.customer?.name ?? "a customer"}</h1>
          <p className="page-lede">For <Link to={`/portal/quote-requests/${p.quote_request.id}`}>{p.quote_request.reference ?? `request #${p.quote_request.id}`}</Link> · {p.quote_request.product_name}</p>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={PAYMENT_STATUS_LABELS[p.status] ?? p.status} />
          {p.proof && <button type="button" className="btn-secondary btn" onClick={openProof}>View proof of payment</button>}
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <h2>Payment</h2>
        <div className="detail-grid">
          <Field label="Amount" value={fmtMoney(p.amount)} />
          <Field label="Quoted premium" value={p.quote?.premium ? fmtMoney(p.quote.premium) : null} />
          <Field label="Method" value={p.method.name} />
          <Field label="Paid into" value={p.pay_to ? `${p.pay_to.bank_name ?? ""} ${p.pay_to.account_number ?? ""} (${p.pay_to.account_name ?? ""})` : null} />
          <Field label="Narration to look for" value={p.reference} />
          <Field label="Payer" value={p.payer_name} />
          <Field label="Bank reference" value={p.payer_reference} />
          <Field label="Paid on (customer)" value={p.paid_on} />
          <Field label="Proof uploaded" value={p.proof ? `${dateTime(p.proof.uploaded_at)} · ${p.proof.name}` : "Not yet"} />
          <Field label="Started" value={dateTime(p.created_at)} />
          <Field label="Customer" value={p.customer ? `${p.customer.name} · ${p.customer.email}${p.customer.phone ? ` · ${p.customer.phone}` : ""}` : null} />
          {p.reviewed_at && <Field label={p.status === "approved" ? "Approved" : "Reviewed"} value={`${p.reviewed_by ?? ""}, ${dateTime(p.reviewed_at)}`} />}
          {p.approval_note && <Field label="Approval note" value={p.approval_note} />}
          {p.rejection_reason && <Field label="Rejection reason" value={p.rejection_reason} />}
          {p.cancelled_at && <Field label="Cancelled by the customer" value={dateTime(p.cancelled_at)} />}
        </div>
      </div>

      {p.status === "approved" && p.policy_detail && (
        <div className="card">
          <h2>Policy</h2>
          <div className="detail-grid">
            <Field label="Status" value={<StatusBadge status={POLICY_STATUS_LABELS[p.policy_detail.status ?? ""] ?? p.policy_detail.status} />} />
            <Field label="Policy no." value={p.policy_detail.policy_no} />
            <Field label="Policy in the ERP" value={p.policy_detail.transaction_id ? <Link to={`/transactions/${p.policy_detail.transaction_id}`}>Open →</Link> : null} />
            <Field label="Receipt" value={p.policy_detail.receipt_id ? <Link to={`/receipts/${p.policy_detail.receipt_id}`}>Open →</Link> : null} />
          </div>
          {p.policy_detail.error && (
            <div className="flash flash-warning" style={{ marginTop: "0.75rem" }}>
              {p.policy_detail.error} <Link to={`/portal/quote-requests/${p.quote_request.id}`}>Go to the request →</Link>
            </div>
          )}
        </div>
      )}

      <RoleGate need="write">
        {reviewable && (
          <div className="card">
            <h2>Review</h2>
            {p.status === "initiated" && <p className="page-lede">The customer has not uploaded proof yet. You can approve once they do, or reject it now.</p>}
            <div className="form-grid">
              {p.status === "pending" && (
                <form className="field span-2" onSubmit={(e) => review("approve", e)}>
                  <label htmlFor="approve_note">Approve: the money is on the bank statement</label>
                  <input id="approve_note" placeholder="Note (optional), e.g. statement line" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="form-actions">
                    <button type="submit" className="btn" disabled={busy !== null}>{busy === "approve" ? "Approving…" : "Approve and issue the policy"}</button>
                  </div>
                </form>
              )}
              <form className="field span-2" onSubmit={(e) => review("reject", e)}>
                <label htmlFor="reject_reason">Reject: the customer sees this reason and can pay again</label>
                <textarea id="reject_reason" rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No transfer with this reference reached our account." />
                <div className="form-actions">
                  <button type="submit" className="btn-danger btn" disabled={busy !== null}>{busy === "reject" ? "Rejecting…" : "Reject payment"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </RoleGate>

      {p.other_attempts.length > 0 && (
        <div className="card">
          <h2>Other payments for this quote</h2>
          <table>
            <thead><tr><th>Reference</th><th>Started</th><th>Status</th><th>Reviewed</th><th>Reason</th></tr></thead>
            <tbody>
              {p.other_attempts.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/portal/payments/${o.id}`}>{o.reference}</Link></td>
                  <td>{dateTime(o.created_at)}</td>
                  <td><StatusBadge status={PAYMENT_STATUS_LABELS[o.status] ?? o.status} /></td>
                  <td>{dateTime(o.reviewed_at)}</td>
                  <td>{o.rejection_reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

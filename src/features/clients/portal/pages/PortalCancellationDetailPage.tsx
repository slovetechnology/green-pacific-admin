import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { dateTime, shortDate } from "../api";
import { CANCELLATION_STATUS_LABELS, type CancellationStatus } from "./PortalCancellationsPage";

interface Detail {
  id: number;
  reference: string;
  status: CancellationStatus;
  reason: string;
  wanted_from: string | null;
  decline_reason: string | null;
  refund_amount: number | null;
  refund_note: string | null;
  effective_date: string | null;
  insurer_method: "online" | "manual" | null;
  insurer_error: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  policy_event_id: number | null;
  policy: { id: number; policy_no: string | null; class_of_business: string | null; subject_matter: string | null; start_date: string | null; end_date: string | null; status: string; premium_due: number | null; premium_paid: number | null; insurer_name: string | null } | null;
  portal_request: { id: number; reference: string | null; product_name: string | null; product_source: string; insurer_policy_ref: string | null } | null;
  customer: { id: number; name: string; email: string; phone: string | null } | null;
  online_cancellation: { available: boolean; why?: string };
  /** Emple is being asked to cancel it right now (in the background). */
  cancelling_online: boolean;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function PortalCancellationDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-cancellation", id],
    queryFn: () => api.get<{ data: Detail }>(`/api/customer-cancellations/${id}`),
    refetchInterval: (q) => (q.state.data?.data.cancelling_online ? 3000 : false),
  });

  async function act(kind: "approve" | "confirm" | "retry-online" | "decline", e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(kind);
    try {
      const decision = { refund_amount: refundAmount === "" ? undefined : refundAmount, refund_note: refundNote || undefined, effective_date: effectiveDate || undefined };
      const payload = kind === "decline" ? { reason: declineReason } : kind === "retry-online" ? {} : decision;
      await api.post(`/api/customer-cancellations/${id}/${kind}`, payload);
      await queryClient.invalidateQueries({ queryKey: ["portal-cancellation", id] });
      await queryClient.invalidateQueries({ queryKey: ["portal-cancellations"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p>Loading…</p>;
  const c = data?.data;
  if (!c) return <p>Cancellation request not found.</p>;
  const open = c.status === "pending" || c.status === "awaiting_insurer";

  const refundFields = (
    <>
      <div className="field">
        <label htmlFor="cx-effective">Cancellation takes effect</label>
        <input id="cx-effective" type="date" value={effectiveDate} placeholder={c.effective_date ?? c.wanted_from ?? ""} onChange={(e) => setEffectiveDate(e.target.value)} />
        <span className="muted small">Blank: {c.effective_date ?? c.wanted_from ?? "today"}{!c.effective_date && c.wanted_from ? " (the date the customer asked for)" : ""}</span>
      </div>
      <div className="field">
        <label htmlFor="cx-refund">Refund agreed with the insurer (₦)</label>
        <input id="cx-refund" type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Leave blank if not known yet" />
      </div>
      <div className="field span-2">
        <label htmlFor="cx-note">Refund note (the customer sees it)</label>
        <input id="cx-note" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="e.g. Pro-rata refund, paid to your account within 10 working days" />
      </div>
    </>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/portal/cancellations">Policy Cancellations</Link></p>
          <h1>{c.reference}</h1>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={CANCELLATION_STATUS_LABELS[c.status] ?? c.status} />
        </div>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <h2>Request</h2>
        <div className="detail-grid">
          <Field label="Customer" value={c.customer ? <>{c.customer.name}<div className="muted small">{c.customer.email}{c.customer.phone ? ` · ${c.customer.phone}` : ""}</div></> : null} />
          <Field label="Asked" value={dateTime(c.created_at)} />
          <Field label="Wants it to end" value={c.wanted_from ?? "As soon as possible"} />
          <div className="span-2"><div className="k">Reason</div><div className="v" style={{ whiteSpace: "pre-line" }}>{c.reason}</div></div>
          {c.decline_reason && <div className="span-2"><div className="k">Declined because</div><div className="v">{c.decline_reason}</div></div>}
          {c.reviewed_by && <Field label="Reviewed" value={`${c.reviewed_by} · ${dateTime(c.reviewed_at)}`} />}
        </div>
      </div>

      {c.policy && (
        <div className="card">
          <h2>Policy</h2>
          <div className="detail-grid">
            <Field label="Policy" value={<Link to={`/transactions/${c.policy.id}`}>{c.policy.policy_no || `#${c.policy.id}`}</Link>} />
            <Field label="Class" value={c.policy.class_of_business} />
            <Field label="Insured" value={c.policy.subject_matter} />
            <Field label="Insurer" value={c.policy.insurer_name} />
            <Field label="Period" value={`${shortDate(c.policy.start_date)} to ${shortDate(c.policy.end_date)}`} />
            <Field label="Premium" value={c.policy.premium_due != null ? fmtMoney(c.policy.premium_due) : null} />
            <Field label="Paid" value={c.policy.premium_paid != null ? fmtMoney(c.policy.premium_paid) : null} />
            <Field label="ERP status" value={c.policy.status} />
            {c.portal_request && <Field label="Bought through the portal" value={<Link to={`/portal/quote-requests/${c.portal_request.id}`}>{c.portal_request.reference ?? `#${c.portal_request.id}`}</Link>} />}
          </div>
        </div>
      )}

      {c.status === "cancelled" && (
        <div className="card">
          <h2>Cancelled</h2>
          <div className="detail-grid">
            <Field label="Took effect" value={c.effective_date} />
            <Field label="How" value={c.insurer_method === "online" ? "Online with the insurer" : "With the insurer, by staff"} />
            <Field label="Recorded" value={dateTime(c.cancelled_at)} />
            <Field label="Refund" value={c.refund_amount != null ? fmtMoney(c.refund_amount) : null} />
            <Field label="Refund note" value={c.refund_note} />
          </div>
          <p className="muted small">Recorded on the policy as a Cancellation event; the policy is Cancelled in the ERP.</p>
        </div>
      )}

      <RoleGate need="write">
        {c.status === "pending" && (
          <div className="card">
            <h2>Approve</h2>
            <p className="page-lede">
              {c.online_cancellation.available
                ? "Approving asks Emple to cancel the policy online; once Emple confirms, it is recorded here (usually within a minute)."
                : `Approving marks it to be cancelled with the insurer. ${c.online_cancellation.why ?? ""}`}
            </p>
            <form onSubmit={(e) => act("approve", e)}>
              <div className="form-grid">{refundFields}</div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={busy !== null}>{busy === "approve" ? "Approving…" : c.online_cancellation.available ? "Approve and cancel with Emple" : "Approve"}</button>
              </div>
            </form>
          </div>
        )}

        {c.status === "awaiting_insurer" && (
          <div className="card">
            <h2>Cancel with the insurer</h2>
            {c.cancelling_online && <div className="flash">Asking Emple to cancel the policy… this page updates by itself.</div>}
            {c.insurer_error && <div className="flash flash-warning">{c.insurer_error}</div>}
            <p className="page-lede">Once the insurer has cancelled the policy, confirm it here: the policy is set to Cancelled in the ERP and the customer is told.</p>
            {c.online_cancellation.available && !c.cancelling_online && !/Emple cancelled the policy/.test(c.insurer_error ?? "") && (
              <p><button type="button" className="btn-secondary btn" disabled={busy !== null} onClick={() => act("retry-online")}>{busy === "retry-online" ? "Asking Emple…" : "Ask Emple to cancel again"}</button></p>
            )}
            <form onSubmit={(e) => act("confirm", e)}>
              <div className="form-grid">{refundFields}</div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={busy !== null}>{busy === "confirm" ? "Saving…" : "Confirm it's cancelled"}</button>
              </div>
            </form>
          </div>
        )}

        {open && !c.cancelling_online && !/Emple cancelled the policy/.test(c.insurer_error ?? "") && (
          <div className="card">
            <h2>Decline</h2>
            <form onSubmit={(e) => act("decline", e)}>
              <div className="field">
                <label htmlFor="cx-decline">Reason (the customer sees it)</label>
                <textarea id="cx-decline" rows={2} required value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-danger btn" disabled={busy !== null}>{busy === "decline" ? "Declining…" : "Decline request"}</button>
              </div>
            </form>
          </div>
        )}
      </RoleGate>
    </div>
  );
}

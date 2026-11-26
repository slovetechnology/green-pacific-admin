import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import { useAuth } from "@/features/platform/auth/AuthContext";
import "@/shared/styles/pipeline.css";

// Finance > Client refunds (backend finance/refunds). Top: policies holding more of a client's money than the premium
// still due (a return premium, a cancelled paid policy, an overpayment), each with a "Raise refund" button. Below: every
// refund with its status. Raising needs write access; approving needs a finance director (never the requester);
// recording the payment needs a finance director or accountant. The server checks all of it.

interface Due {
  transaction_id: number;
  client_id: number;
  client_name: string | null;
  insurer_name: string | null;
  policy_no: string | null;
  class_of_business: string | null;
  status: string;
  paid: number;
  still_due: number;
  refunded: number;
  refundable: number;
  suggested_source: string;
}

interface Refund {
  id: number;
  refund_no: string;
  client_name: string | null;
  policy_no: string | null;
  transaction_id: number;
  source: string;
  amount: number;
  reason: string;
  payee_name: string;
  bank_name: string | null;
  account_no: string | null;
  status: "Requested" | "Approved" | "Paid" | "Rejected" | "Voided";
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  paid_date: string | null;
  payment_reference: string | null;
  closed_reason: string | null;
}

interface RefundList {
  refunds: Refund[];
  sources: string[];
  canApprove: boolean;
  canPay: boolean;
}

const STATUS_BADGE: Record<Refund["status"], string> = {
  Requested: "badge badge-warning",
  Approved: "badge badge-secondary",
  Paid: "badge badge-paid",
  Rejected: "badge badge-cancelled",
  Voided: "badge badge-cancelled",
};
const FILTERS = ["", "Requested", "Approved", "Paid", "Rejected", "Voided"];
const today = () => new Date().toISOString().slice(0, 10);

type Action = { kind: "approve" | "reject" | "void" | "paid"; refund: Refund };

export function ClientRefundsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const dueQuery = useQuery({ queryKey: ["refunds", "due"], queryFn: () => api.get<{ due: Due[] }>("/api/refunds/due") });
  const listQuery = useQuery({
    queryKey: ["refunds", "list", filter],
    queryFn: () => api.get<RefundList>(`/api/refunds${filter ? `?status=${encodeURIComponent(filter)}` : ""}`),
  });
  const list = listQuery.data;

  // Raise form
  const [raising, setRaising] = useState<Due | null>(null);
  const [form, setForm] = useState({ amount: "", source: "", reason: "", payee_name: "", bank_name: "", account_no: "" });
  // Approve / reject / void / paid
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [paidDate, setPaidDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["refunds"] });

  const raise = useMutation({
    mutationFn: () => api.post<{ refund: Refund }>("/api/refunds", { ...form, transaction_id: raising!.transaction_id }),
    onSuccess: (res) => { setRaising(null); setNotice(`Refund ${res.refund.refund_no} raised. It now needs a finance director's approval.`); void refresh(); },
  });
  const act = useMutation({
    mutationFn: () => {
      const a = action!;
      const base = `/api/refunds/${a.refund.id}`;
      if (a.kind === "approve") return api.post(`${base}/approve`);
      if (a.kind === "paid") return api.post(`${base}/paid`, { paid_date: paidDate, payment_reference: reference });
      return api.post(`${base}/${a.kind}`, { reason });
    },
    onSuccess: () => {
      const a = action!;
      setNotice(`Refund ${a.refund.refund_no} ${a.kind === "paid" ? "recorded as paid" : a.kind === "approve" ? "approved" : a.kind === "reject" ? "rejected" : "voided"}.`);
      setAction(null);
      void refresh();
    },
  });

  function openRaise(d: Due) {
    setForm({ amount: d.refundable.toFixed(2), source: d.suggested_source, reason: "", payee_name: d.client_name ?? "", bank_name: "", account_no: "" });
    raise.reset();
    setRaising(d);
  }
  function openAction(kind: Action["kind"], refund: Refund) {
    setReason("");
    setReference("");
    setPaidDate(today());
    act.reset();
    setAction({ kind, refund });
  }

  const due = dueQuery.data?.due ?? [];
  const totalDue = due.reduce((s, d) => s + d.refundable, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Client refunds</h1>
          <p className="text-muted">Premium paid back to clients from the premium trust account. Every refund is approved by a finance director before it is paid.</p>
        </div>
      </div>
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <h2>Money owed to clients</h2>
        <p className="text-muted">
          Policies where the client has paid more than the premium still due: a return premium on an endorsement, a policy
          cancelled after it was paid, or an overpayment. {due.length > 0 && <>Total <strong>{fmtMoney(totalDue)}</strong> on {due.length} polic{due.length === 1 ? "y" : "ies"}.</>}
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Client</th><th>Policy</th><th>Insurer</th><th>Why</th><th className="num">Paid</th><th className="num">Still due</th><th className="num">Already refunded</th><th className="num">Refundable</th></tr>
            </thead>
            <tbody>
              {dueQuery.isLoading && <tr><td colSpan={8}>Loading…</td></tr>}
              {!dueQuery.isLoading && due.length === 0 && <tr><td colSpan={8}>No client is owed a refund.</td></tr>}
              {due.map((d) => (
                <tr key={d.transaction_id}>
                  <td>{d.client_name ?? "—"}</td>
                  <td><Link to={`/transactions/${d.transaction_id}`}>{d.policy_no || `#${d.transaction_id}`}</Link></td>
                  <td>{d.insurer_name ?? "—"}</td>
                  <td>{d.suggested_source}</td>
                  <td className="num">{fmtMoney(d.paid)}</td>
                  <td className="num">{fmtMoney(d.still_due)}</td>
                  <td className="num">{fmtMoney(d.refunded)}</td>
                  <td className="num">
                    <strong>{fmtMoney(d.refundable)}</strong>
                    {user?.canWrite && <div style={{ marginTop: "0.35rem" }}><button type="button" className="btn btn-sm" onClick={() => openRaise(d)}>Raise refund</button></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Refunds</h2>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }}>
              {FILTERS.map((f) => <option key={f} value={f}>{f || "All"}</option>)}
            </select>
          </label>
        </div>
        <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
          <table className="data-table">
            <thead>
              <tr><th>Refund</th><th>Client / policy</th><th>Source</th><th className="num">Amount</th><th>Pay to</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {listQuery.isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
              {list && list.refunds.length === 0 && <tr><td colSpan={7}>No refunds{filter ? ` with status ${filter}` : ""}.</td></tr>}
              {list?.refunds.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.refund_no}</strong>
                    <div className="text-muted" style={{ fontSize: "0.8rem" }}>Raised by {r.requested_by}</div>
                  </td>
                  <td>
                    {r.client_name ?? "—"}
                    <div><Link to={`/transactions/${r.transaction_id}`}>{r.policy_no || `#${r.transaction_id}`}</Link></div>
                  </td>
                  <td>{r.source}<div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.reason}</div></td>
                  <td className="num">{fmtMoney(r.amount)}</td>
                  <td>{r.payee_name}<div className="text-muted" style={{ fontSize: "0.8rem" }}>{[r.bank_name, r.account_no].filter(Boolean).join(" · ") || "—"}</div></td>
                  <td>
                    <span className={STATUS_BADGE[r.status]}>{r.status}</span>
                    {r.approved_by && r.status !== "Rejected" && <div className="text-muted" style={{ fontSize: "0.8rem" }}>Approved by {r.approved_by}</div>}
                    {r.status === "Paid" && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.paid_date}, ref {r.payment_reference}</div>}
                    {r.closed_reason && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{r.closed_reason}</div>}
                  </td>
                  <td>
                    <div className="actions-row">
                      {r.status === "Requested" && list.canApprove && r.requested_by.toLowerCase() !== user?.username.toLowerCase() && (
                        <button type="button" className="btn btn-sm" onClick={() => openAction("approve", r)}>Approve</button>
                      )}
                      {r.status === "Requested" && list.canApprove && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => openAction("reject", r)}>Reject</button>
                      )}
                      {r.status === "Approved" && list.canPay && (
                        <button type="button" className="btn btn-sm" onClick={() => openAction("paid", r)}>Record payment</button>
                      )}
                      {(r.status === "Requested" || r.status === "Approved") && user?.canWrite && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => openAction("void", r)}>Void</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={raising !== null}
        title={`Raise refund: ${raising?.client_name ?? ""}, ${raising?.policy_no ?? ""}`}
        onClose={() => setRaising(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRaising(null)}>Cancel</button>
            <button type="button" className="btn" disabled={raise.isPending} onClick={() => raise.mutate()}>{raise.isPending ? "Saving…" : "Raise refund"}</button>
          </>
        }
      >
        {raise.isError && <div className="flash flash-error">{(raise.error as Error).message}</div>}
        <p style={{ marginTop: 0 }}>Up to <strong>{fmtMoney(raising?.refundable ?? 0)}</strong> can be refunded on this policy.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rf_amount">Amount (NGN)</label>
            <input id="rf_amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rf_source">Source</label>
            <select id="rf_source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {(list?.sources ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="rf_reason">Reason</label>
            <textarea id="rf_reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Vehicle sold; policy cancelled from 1 March" />
          </div>
          <div className="field">
            <label htmlFor="rf_payee">Pay to</label>
            <input id="rf_payee" value={form.payee_name} onChange={(e) => setForm({ ...form, payee_name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rf_bank">Bank</label>
            <input id="rf_bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rf_account">Account number (NUBAN)</label>
            <input id="rf_account" inputMode="numeric" maxLength={10} value={form.account_no} onChange={(e) => setForm({ ...form, account_no: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal
        open={action !== null}
        title={action ? `${action.kind === "paid" ? "Record payment" : action.kind[0].toUpperCase() + action.kind.slice(1)}: ${action.refund.refund_no}` : ""}
        onClose={() => setAction(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAction(null)}>Cancel</button>
            <button
              type="button"
              className={action?.kind === "approve" || action?.kind === "paid" ? "btn" : "btn btn-danger"}
              disabled={act.isPending || ((action?.kind === "reject" || action?.kind === "void") && !reason.trim()) || (action?.kind === "paid" && !reference.trim())}
              onClick={() => act.mutate()}
            >
              {act.isPending ? "Saving…" : action?.kind === "approve" ? "Approve refund" : action?.kind === "paid" ? "Record payment" : action?.kind === "reject" ? "Reject refund" : "Void refund"}
            </button>
          </>
        }
      >
        {act.isError && <div className="flash flash-error">{(act.error as Error).message}</div>}
        {action && (
          <p style={{ marginTop: 0 }}>
            {fmtMoney(action.refund.amount)} to {action.refund.payee_name}{action.refund.bank_name ? `, ${action.refund.bank_name}` : ""}
            {action.refund.account_no ? ` ${action.refund.account_no}` : ""}. Raised by {action.refund.requested_by}: {action.refund.reason}
          </p>
        )}
        {action?.kind === "paid" && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rf_paid_date">Date paid</label>
              <input id="rf_paid_date" type="date" value={paidDate} max={today()} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rf_ref">Bank transfer reference</label>
              <input id="rf_ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
        )}
        {(action?.kind === "reject" || action?.kind === "void") && (
          <div className="field">
            <label htmlFor="rf_close_reason">Reason (required)</label>
            <textarea id="rf_close_reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {action?.kind === "approve" && <p className="text-muted">Once approved, a finance director or accountant pays it and records the bank reference.</p>}
      </Modal>
    </div>
  );
}

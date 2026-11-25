import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { Modal } from "@/shared/components/exec/Modal";
import { RoleGate } from "@/app/guards/RoleGate";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { alertDialog, confirmDialog, promptDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/executive.css";
import "@/shared/styles/endorsement-engine.css";
import { engine, fmtKobo, humanize, WORKFLOW_LABEL, WRITE_OFF_ROUTE_LABEL, type EndorsementRow, type Refund } from "../api";
import { approvedMessage, approvePending, rejectPending, showError } from "../approvals";
import { OverpaymentAllocationModal } from "../components/OverpaymentAllocationModal";

// Scenario 5 and the supervisors' queue: refund vouchers (approve -> pay from client trust / operating bank ->
// reconcile to the bank statement), error reversals and non-payment write-offs waiting for a checker, return-premium debit notes the insurers
// still have to refund, client credit lookup and pre-funding, and the tax reversibility settings.

const TONE: Record<string, string> = { PENDING_APPROVAL: "is-warn", APPROVED: "is-info", PAID: "is-ok", RECONCILED: "is-ok", CANCELLED: "is-crit" };
const today = () => new Date().toISOString().slice(0, 10);
const run = async (work: () => Promise<unknown>, refresh: () => Promise<unknown>) => {
  try {
    await work();
    await refresh();
  } catch (err) {
    void alertDialog(err instanceof Error ? err.message : "That didn't work.");
  }
};

function PayModal({ refund, onClose, onDone }: { refund: Refund; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    paid_date: today(), payment_reference: "", payment_method: "Bank transfer",
    trust_amount: (refund.trust_amount_cents / 100).toFixed(2), operating_amount: (refund.operating_amount_cents / 100).toFixed(2),
  });
  const [error, setError] = useState<string | null>(null);
  const sum = Math.round(Number(form.trust_amount) * 100) + Math.round(Number(form.operating_amount) * 100);
  async function submit() {
    setError(null);
    try {
      await engine.payRefund(refund.id, form);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    }
  }
  return (
    <Modal open wide title={`Pay refund voucher ${refund.voucher_no}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button><button type="button" className="btn" onClick={submit} disabled={sum !== refund.amount_cents}>Record payment</button></>}>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      <div className="ee-kv">
        <div><span>Voucher amount</span><strong>{fmtKobo(refund.amount_cents)}</strong></div>
        <div><span>Payee</span><strong>{refund.client_name}</strong></div>
      </div>
      <p className="muted">{refund.payee_bank_details}</p>
      <div className="field"><label htmlFor="rf-date">Paid on</label><input id="rf-date" type="date" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} /></div>
      <div className="field"><label htmlFor="rf-ref">Bank transfer / cheque reference</label><input id="rf-ref" type="text" value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} /></div>
      <div className="field"><label htmlFor="rf-trust">From Client Trust Bank Account (insurer-funded RP, client money)</label><input id="rf-trust" type="number" step="0.01" value={form.trust_amount} onChange={(e) => setForm({ ...form, trust_amount: e.target.value })} /></div>
      <div className="field"><label htmlFor="rf-op">From Broker Operating Account (commission clawback already moved to revenue, or pre-funding)</label><input id="rf-op" type="number" step="0.01" value={form.operating_amount} onChange={(e) => setForm({ ...form, operating_amount: e.target.value })} /></div>
      {sum !== refund.amount_cents && <div className="flash flash-error">The two banks must add up to {fmtKobo(refund.amount_cents)}.</div>}
    </Modal>
  );
}

function RefundsTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [paying, setPaying] = useState<Refund | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["engine", "refunds", status], queryFn: () => engine.refunds(status || undefined) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["engine"] });

  async function reconcile(r: Refund) {
    const ref = await promptDialog({ message: `Bank statement reference for ${r.voucher_no}`, required: true });
    if (!ref) return;
    await run(() => engine.reconcileRefund(r.id, { bank_statement_ref: ref, reconciled_date: today() }), refresh);
  }
  async function cancel(r: Refund) {
    const reason = await promptDialog({ message: `Why cancel ${r.voucher_no}? The credit returns to the client's wallet.`, required: true });
    if (!reason) return;
    await run(() => engine.cancelRefund(r.id, reason), refresh);
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Refund vouchers</h2>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(TONE).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
      </div>
      {isLoading ? <p>Loading…</p> : !data?.refunds.length ? <p>No refund vouchers.</p> : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Voucher</th><th>Client</th><th className="num">Amount</th><th className="num">Trust</th><th className="num">Operating</th><th>Status</th><th>Raised by</th><th>Bank</th><th /></tr></thead>
            <tbody>
              {data.refunds.map((r) => (
                <tr key={r.id}>
                  <td>{r.voucher_no}</td>
                  <td><Link to={`/clients/${r.client_id}`}>{r.client_name}</Link></td>
                  <td className="num">{fmtKobo(r.amount_cents)}</td>
                  <td className="num">{fmtKobo(r.trust_amount_cents)}</td>
                  <td className="num">{fmtKobo(r.operating_amount_cents)}</td>
                  <td><span className={`ee-chip ${TONE[r.status]}`}>{humanize(r.status)}</span></td>
                  <td>{r.created_by}{r.approved_by_name ? ` / ${r.approved_by_name}` : ""}</td>
                  <td>{r.payment_reference || "—"}{r.bank_statement_ref ? ` · ${r.bank_statement_ref}` : ""}</td>
                  <td>
                    <RoleGate need="write">
                      <span className="ee-inline">
                        {r.status === "PENDING_APPROVAL" && user?.isAdmin && user.username !== r.created_by && (
                          <button type="button" className="btn btn-sm" onClick={() => run(() => engine.approveRefund(r.id), refresh)}>Approve</button>
                        )}
                        {r.status === "APPROVED" && <button type="button" className="btn btn-sm" onClick={() => setPaying(r)}>Pay</button>}
                        {r.status === "PAID" && <button type="button" className="btn-secondary btn btn-sm" onClick={() => reconcile(r)}>Reconcile</button>}
                        {(r.status === "PENDING_APPROVAL" || r.status === "APPROVED") && <button type="button" className="btn-danger btn btn-sm" onClick={() => cancel(r)}>Cancel</button>}
                      </span>
                    </RoleGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paying && <PayModal refund={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void refresh(); }} />}
    </div>
  );
}

function ApprovalsTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["engine", "endorsements", "PENDING_APPROVAL"], queryFn: () => engine.endorsements("PENDING_APPROVAL") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["engine"] });
  async function approve(row: EndorsementRow) {
    try {
      const r = await approvePending(row);
      if (!r) return;
      await refresh();
      void alertDialog(approvedMessage(row, r));
    } catch (err) {
      showError(err, "Could not approve.");
    }
  }
  async function reject(row: EndorsementRow) {
    try {
      if (await rejectPending(row)) await refresh();
    } catch (err) {
      showError(err, "Could not reject.");
    }
  }
  return (
    <div className="card">
      <h2>Waiting for a supervisor (maker-checker)</h2>
      {isLoading ? <p>Loading…</p> : !data?.endorsements.length ? <p>Nothing waiting for approval.</p> : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Request</th><th>Type</th><th>Policy</th><th className="num">Amount</th><th>Reason</th><th>Requested by</th><th /></tr></thead>
            <tbody>
              {data.endorsements.map((e) => (
                <tr key={e.id}>
                  <td>{e.endorsement_number}</td>
                  <td>
                    {WORKFLOW_LABEL[e.endorsement_type]}
                    {e.endorsement_type === "NON_PAYMENT_WRITE_OFF" && e.write_off_route && (
                      <div>
                        <span className={`ee-chip ${e.write_off_route === "BROKER_ABSORBS" ? "is-crit" : e.write_off_route === "RECOVER_FROM_INSURER" ? "is-warn" : "is-ok"}`}>
                          {WRITE_OFF_ROUTE_LABEL[e.write_off_route]}
                        </span>
                        {Number(e.bad_debt_cents) > 0 && <div className="text-muted">Bad debt {fmtKobo(e.bad_debt_cents)}</div>}
                      </div>
                    )}
                  </td>
                  <td><Link to={`/transactions/${e.policy_id}`}>{e["policy.policy_no"] || e["policy.credit_note_no"] || `#${e.policy_id}`}</Link></td>
                  <td className="num">{fmtKobo(e.gross_rp)}</td>
                  <td>{humanize(e.reason_code || "")}: {e.audit_notes}</td>
                  <td>{e.created_by}</td>
                  <td>
                    {user?.isAdmin && user.username !== e.created_by ? (
                      <span className="ee-inline">
                        <button type="button" className="btn btn-sm" onClick={() => approve(e)}>Approve</button>
                        <button type="button" className="btn-danger btn btn-sm" onClick={() => reject(e)}>Reject</button>
                      </span>
                    ) : <span className="text-muted">{user?.username === e.created_by ? "You raised it" : "Admin only"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InsurerRefundsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["engine", "open-rpd"], queryFn: () => engine.openRpDebitNotes() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["engine"] });
  async function record(noteId: number, due: number, noteNo: string) {
    const amount = await promptDialog({ message: `Amount the insurer paid on ${noteNo}`, defaultValue: (due / 100).toFixed(2), required: true });
    if (!amount) return;
    const reference = await promptDialog({ message: "Insurer's payment reference", required: true });
    if (!reference) return;
    await run(() => engine.insurerRefund(noteId, { amount, reference, settled_date: today(), bank_account: "CLIENT_TRUST_BANK" }), refresh);
  }
  return (
    <div className="card">
      <h2>Return premium due back from insurers</h2>
      <p className="text-muted">Return Premium Debit Notes on premium the insurer already held. When the insurer pays, the client's refund is released from PENDING_INSURER_REFUND.</p>
      {isLoading ? <p>Loading…</p> : !data?.notes.length ? <p>No insurer refunds outstanding.</p> : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>RP Debit Note</th><th>Insurer</th><th>Client</th><th>Date</th><th className="num">Net RP</th><th className="num">Received</th><th /></tr></thead>
            <tbody>
              {data.notes.map((n) => (
                <tr key={n.id}>
                  <td><Link to={`/transactions/${n.transaction_id}`}>{n.note_no}</Link></td>
                  <td>{n.insurer_name}</td>
                  <td>{n.client_name}</td>
                  <td>{n.note_date}</td>
                  <td className="num">{fmtKobo(n.settlement_target_cents)}</td>
                  <td className="num">{fmtKobo(n.settled_cents)}</td>
                  <td><RoleGate need="write"><button type="button" className="btn btn-sm" onClick={() => record(n.id, n.settlement_target_cents - n.settled_cents, n.note_no)}>Record insurer refund</button></RoleGate></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientCreditTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [clientId, setClientId] = useState("");
  const [allocating, setAllocating] = useState(false);
  const clients = useQuery({ queryKey: ["clients", "options"], queryFn: () => api.get<{ clients: { id: number; name: string }[] }>("/api/clients/options") });
  const wallet = useQuery({ queryKey: ["engine", "wallet", Number(clientId)], queryFn: () => engine.wallet(clientId), enabled: Boolean(clientId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["engine"] });
  return (
    <div className="card">
      <div className="page-header">
        <h2>Client credit (fiduciary wallet)</h2>
        <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client…</option>
          {(clients.data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {wallet.data && (
        <>
          <div className="ee-kv">
            <div><span>Available</span><strong>{fmtKobo(wallet.data.availableCents)}</strong></div>
            <div><span>Waiting for insurer refund</span><strong>{fmtKobo(wallet.data.pendingInsurerRefundCents)}</strong></div>
          </div>
          <RoleGate need="write">
            <p><button type="button" className="btn" disabled={wallet.data.availableCents <= 0} onClick={() => setAllocating(true)}>Refund / apply / carry forward…</button></p>
          </RoleGate>
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead><tr><th>Date</th><th>Credit</th><th className="num">Amount</th><th className="num">Remaining</th><th>Hold</th><th>Narration</th><th /></tr></thead>
              <tbody>
                {wallet.data.credits.map((c) => (
                  <tr key={c.id}>
                    <td>{c.entry_date}</td>
                    <td>{humanize(c.entry_type)}</td>
                    <td className="num">{fmtKobo(c.amount_cents)}</td>
                    <td className="num">{fmtKobo(c.remaining_cents)}</td>
                    <td>{c.hold_status === "PENDING_INSURER_REFUND" ? <span className="ee-chip is-warn">Pending insurer refund</span> : c.prefunded ? <span className="ee-chip is-info">Pre-funded</span> : <span className="ee-chip is-ok">Available</span>}</td>
                    <td>{c.narration}</td>
                    <td>
                      {c.hold_status === "PENDING_INSURER_REFUND" && user?.isAdmin && (
                        <button type="button" className="btn-secondary btn btn-sm" onClick={async () => {
                          if (await confirmDialog("Pre-fund this return premium from the broker's operating account so the client is paid before the insurer refunds?")) {
                            await run(() => engine.prefund(c.id), refresh);
                          }
                        }}>Approve pre-funding</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allocating && <OverpaymentAllocationModal open clientId={Number(clientId)} onClose={() => setAllocating(false)} />}
        </>
      )}
    </div>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["engine", "settings"], queryFn: () => engine.settings() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["engine", "settings"] });
  const defaultScale = (data?.shortRateScales || []).filter((s) => s.insurer_id === null);
  return (
    <div className="card">
      <h2>Taxes and levies on return premiums</h2>
      <table className="exec-table is-static">
        <thead><tr><th>Tax</th><th>Basis</th><th className="num">Rate / amount</th><th>Refundable on cancellation</th><th>Active</th></tr></thead>
        <tbody>
          {(data?.taxes || []).map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{humanize(t.basis)}</td>
              <td className="num">
                <RoleGate need="admin">
                  <input type="number" step="0.01" min="0" style={{ width: "7rem" }} aria-label={`${t.name} ${t.basis === "FIXED" ? "amount" : "rate %"}`}
                    defaultValue={t.basis === "FIXED" ? t.fixed_amount_cents / 100 : t.rate_bps / 100}
                    onBlur={(e) => run(() => engine.updateTax(t.id, t.basis === "FIXED" ? { fixed_amount: e.target.value } : { rate_pct: e.target.value }), refresh)} />
                </RoleGate>
                {t.basis === "FIXED" ? "" : " %"}
              </td>
              <td><input type="checkbox" aria-label={`${t.name} refundable`} checked={Boolean(t.is_refundable_on_cancellation)} onChange={(e) => run(() => engine.updateTax(t.id, { is_refundable_on_cancellation: e.target.checked }), refresh)} /></td>
              <td><input type="checkbox" aria-label={`${t.name} active`} checked={Boolean(t.is_active)} onChange={(e) => run(() => engine.updateTax(t.id, { is_active: e.target.checked }), refresh)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ marginTop: "1.5rem" }}>Default short-period scale</h2>
      <p className="text-muted">Premium the insurer retains on early termination, by months the cover ran. Insurer-specific scales override it.</p>
      <table className="exec-table is-static">
        <thead><tr><th>Not exceeding (months)</th><th className="num">Retained</th></tr></thead>
        <tbody>{defaultScale.map((s) => <tr key={s.max_months_in_force}><td>{s.max_months_in_force}</td><td className="num">{(s.retained_bps / 100).toFixed(2)}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function RefundsAndApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tabs: TabDef[] = [
    { id: "refunds", label: "Refund vouchers" },
    { id: "approvals", label: "Reversal & write-off approvals" },
    { id: "insurer", label: "Insurer RP refunds due" },
    { id: "credit", label: "Client credit" },
    { id: "settings", label: "Taxes & short-rate" },
  ];
  const tab = tabs.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "refunds";
  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Fiduciary accounting</span>
          <h1>Refunds &amp; Endorsement Approvals</h1>
        </div>
      </header>
      <section className="exec-workspace" aria-label="Refunds workspace">
        <Tabs tabs={tabs} active={tab} onChange={(id) => setParams(id === "refunds" ? {} : { tab: id }, { replace: true })} idPrefix="rf" label="Refund views" />
        <div role="tabpanel" id={`rf-panel-${tab}`} aria-labelledby={`rf-tab-${tab}`} tabIndex={0} className="exec-tabpanel">
          {tab === "refunds" && <RefundsTab />}
          {tab === "approvals" && <ApprovalsTab />}
          {tab === "insurer" && <InsurerRefundsTab />}
          {tab === "credit" && <ClientCreditTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      </section>
    </div>
  );
}

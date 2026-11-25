import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/shared/components/exec/Modal";
import { engine, fmtKobo } from "../api";

// Scenario 4: what to do with a client's excess money (an overpayment, or a return premium credit). It sits in the
// Client Unallocated Credit ledger inside the trust account until the user splits it between:
//   A  refund to the client      -> a refund voucher, paid from the client trust bank after approval
//   B  carry forward (wallet)    -> stays as credit for the next renewal / new debit note
//   C  apply to another open debit note of the same client
const toKobo = (v: string) => Math.round((Number(v) || 0) * 100);

// Mount it only while open (callers render it conditionally), so every opening starts with a clean form.
export function OverpaymentAllocationModal({
  open, clientId, sourceEntryId, onClose, onDone,
}: {
  open: boolean;
  clientId: number;
  /** Limit to one credit (e.g. the overpayment just received); otherwise the whole available balance. */
  sourceEntryId?: number | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: wallet, isLoading } = useQuery({ queryKey: ["engine", "wallet", clientId], queryFn: () => engine.wallet(clientId), enabled: open });
  const source = sourceEntryId ? wallet?.credits.find((c) => c.id === sourceEntryId) : null;
  const available = source ? Math.max(source.remaining_cents ?? 0, 0) : wallet?.availableCents ?? 0;

  const [refund, setRefund] = useState("");
  const [bank, setBank] = useState("");
  const [apply, setApply] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applied = Object.values(apply).reduce((s, v) => s + toKobo(v), 0);
  const used = toKobo(refund) + applied;
  const carry = Math.max(available - used, 0);
  const over = used > available;

  async function submit() {
    setError(null);
    if (over) return setError("You've allocated more than the credit available.");
    if (toKobo(refund) > 0 && !bank.trim()) return setError("Give the client's bank details for the refund.");
    setBusy(true);
    try {
      await engine.allocate(clientId, {
        source_entry_id: sourceEntryId || undefined,
        refund_amount: refund || 0,
        payee_bank_details: bank,
        applications: Object.entries(apply).filter(([, v]) => toKobo(v) > 0).map(([id, v]) => ({ transaction_id: Number(id), amount: v })),
        carry_forward_amount: carry / 100,
        reason: "Client credit settlement",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engine"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["receipts"] }),
      ]);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not allocate the credit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={`Settle client credit${wallet ? ` — ${wallet.client.name}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Decide later (carry forward)</button>
          <button type="button" className="btn" onClick={submit} disabled={busy || over || used === 0}>Allocate</button>
        </>
      }
    >
      {isLoading || !wallet ? <p>Loading…</p> : (
        <div className="ee-alloc-grid">
          <div className="ee-lock-note">
            Held in the <strong>Client Unallocated Credit</strong> ledger (client trust account): never broker revenue, never sent to the insurer unless applied to a debit note.
          </div>
          {error && <div className="flash flash-error" role="alert">{error}</div>}
          <div className="ee-kv">
            <div><span>{source ? "This credit" : "Available credit"}</span><strong>{fmtKobo(available)}</strong></div>
            {wallet.pendingInsurerRefundCents > 0 && <div><span>Waiting for insurer refund</span><strong>{fmtKobo(wallet.pendingInsurerRefundCents)}</strong></div>}
          </div>

          <section className="ee-alloc-option">
            <h4>Option A — Refund to client</h4>
            <div className="ee-inline">
              <input type="number" min="0" step="0.01" aria-label="Refund amount" placeholder="0.00" value={refund} onChange={(e) => setRefund(e.target.value)} />
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => setRefund(((available - applied) / 100).toFixed(2))}>Refund the rest</button>
            </div>
            <div className="field" style={{ marginTop: "0.4rem" }}>
              <label htmlFor="ee-bank">Client bank details</label>
              <input id="ee-bank" type="text" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank, account name, account number" />
            </div>
            <small className="muted">Raises a Client Overpayment Refund Voucher; a supervisor approves it before payment from the client trust bank.</small>
          </section>

          <section className="ee-alloc-option">
            <h4>Option C — Apply to another open debit note</h4>
            {wallet.openNotes.length === 0 ? <p className="muted">This client has no other unpaid debit notes.</p> : (
              <table className="ee-compare">
                <thead><tr><th>Policy</th><th>Debit note</th><th>Outstanding</th><th>Apply</th></tr></thead>
                <tbody>
                  {wallet.openNotes.map((n) => (
                    <tr key={n.id}>
                      <td>{n.policy_no || `#${n.id}`}</td>
                      <td>{n.debit_note_no || "—"}</td>
                      <td>{fmtKobo(Math.round(n.balance_os * 100))}</td>
                      <td>
                        <input type="number" min="0" step="0.01" aria-label={`Apply to ${n.policy_no || n.id}`} style={{ width: "8rem" }}
                          value={apply[n.id] || ""} onChange={(e) => setApply({ ...apply, [n.id]: e.target.value })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="ee-alloc-option">
            <h4>Option B — Carry forward (credit note wallet)</h4>
            <p style={{ margin: 0 }}>Whatever is not refunded or applied stays as credit for the next renewal or new debit note: <strong>{fmtKobo(carry)}</strong>.</p>
          </section>

          <div className={`ee-alloc-sum${over ? " is-over" : ""}`}>
            <span>Refund {fmtKobo(toKobo(refund))} + Apply {fmtKobo(applied)} + Carry forward {fmtKobo(carry)}</span>
            <strong>{fmtKobo(available)}</strong>
          </div>
        </div>
      )}
    </Modal>
  );
}

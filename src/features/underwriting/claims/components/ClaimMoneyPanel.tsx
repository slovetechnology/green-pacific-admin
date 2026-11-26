import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";

export interface ClaimPayment {
  id: number;
  direction: "received" | "paid";
  payment_date: string;
  amount: number;
  payee: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}
export interface ClaimMoney {
  payments: ClaimPayment[];
  totals: { received: number; paid: number; held: number };
  methods: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

// Claim money that passes through the broker: the insurer's settlement received into the claims trust account,
// then paid on to the insured. Each entry posts to the ledger automatically; a mistake is voided, never edited.
export function ClaimMoneyPanel({ claimId, money, approvedAmount }: { claimId: string; money: ClaimMoney; approvedAmount: number }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ direction: "received", payment_date: today(), amount: "", payee: "", method: "Bank Transfer", reference: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["claims", claimId] });
  const record = useMutation({
    mutationFn: () => api.post(`/api/claims/${claimId}/payments`, form),
    onSuccess: () => {
      setMessage(form.direction === "received" ? "Money received from the insurer recorded." : "Payment to the insured recorded.");
      setError(null);
      setForm({ ...form, amount: "", reference: "", notes: "" });
      refresh();
    },
    onError: (err) => { setError(err instanceof ApiError ? err.message : "Could not record the payment."); setMessage(null); },
  });
  const voidIt = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post(`/api/claims/${claimId}/payments/${id}/void`, { reason }),
    onSuccess: () => { setMessage("Payment voided. Its ledger posting is reversed on the next ledger update."); setError(null); refresh(); },
    onError: (err) => { setError(err instanceof ApiError ? err.message : "Could not void the payment."); setMessage(null); },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); record.mutate(); };
  const { totals } = money;

  return <div className="card">
    <h2>Claim money</h2>
    <p className="field-hint">The insurer's settlement is banked in the claims trust account and paid on to the insured. Every entry posts to the ledger, and the client money return (QR-10) checks that what is still held for insureds is covered by the claims trust account.</p>
    <div className="table-wrap"><table><tbody>
      <tr><td>Approved by the insurer</td><td className="num">{fmtMoney(approvedAmount)}</td></tr>
      <tr><td>Received from the insurer</td><td className="num">{fmtMoney(totals.received)}</td></tr>
      <tr><td>Paid to the insured</td><td className="num">{fmtMoney(totals.paid)}</td></tr>
      <tr><td><strong>Held for the insured</strong></td><td className="num"><strong>{fmtMoney(totals.held)}</strong></td></tr>
    </tbody></table></div>
    {message && <div className="flash flash-success">{message}</div>}
    {error && <div className="flash flash-error">{error}</div>}
    <div className="table-wrap" style={{ marginTop: "1rem" }}><table>
      <thead><tr><th>Date</th><th>Movement</th><th className="num">Amount</th><th>Payee / method</th><th>Reference</th><th>By</th><th></th></tr></thead>
      <tbody>
        {money.payments.length === 0 && <tr><td colSpan={7} className="empty-state">No claim money recorded.</td></tr>}
        {money.payments.map((p) => <tr key={p.id} style={p.voided_at ? { opacity: 0.55 } : undefined}>
          <td data-label="Date">{p.payment_date}</td>
          <td data-label="Movement">{p.direction === "received" ? "Received from insurer" : "Paid to insured"}{p.voided_at ? <div className="field-hint">Voided by {p.voided_by}: {p.void_reason}</div> : null}</td>
          <td className="num" data-label="Amount">{p.voided_at ? <s>{fmtMoney(p.amount)}</s> : fmtMoney(p.amount)}</td>
          <td data-label="Payee / method">{[p.payee, p.method].filter(Boolean).join(" · ") || "—"}</td>
          <td data-label="Reference">{p.reference || "—"}</td>
          <td data-label="By">{p.created_by || "—"}</td>
          <td>{!p.voided_at && <RoleGate need="write"><button type="button" className="btn-secondary btn-sm" disabled={voidIt.isPending} onClick={() => {
            const reason = window.prompt("Why is this payment being voided?");
            if (reason && reason.trim()) voidIt.mutate({ id: p.id, reason });
          }}>Void</button></RoleGate>}</td>
        </tr>)}
      </tbody>
    </table></div>
    <RoleGate need="write">
      <form onSubmit={submit} style={{ marginTop: "1rem" }}>
        <div className="form-grid">
          <div className="field"><label htmlFor="cm-dir">Movement</label><select id="cm-dir" value={form.direction} onChange={set("direction")}>
            <option value="received">Received from the insurer</option><option value="paid">Paid to the insured</option>
          </select></div>
          <div className="field"><label htmlFor="cm-date">Date</label><input id="cm-date" type="date" value={form.payment_date} onChange={set("payment_date")} /></div>
          <div className="field"><label htmlFor="cm-amt">Amount (₦)</label><input id="cm-amt" type="number" min={0} step="0.01" value={form.amount} onChange={set("amount")} />
            {form.direction === "paid" && <div className="field-hint">Up to {fmtMoney(totals.held)} held for this claim.</div>}</div>
          <div className="field"><label htmlFor="cm-method">Method</label><select id="cm-method" value={form.method} onChange={set("method")}>
            {money.methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select></div>
          {form.direction === "paid" && <div className="field"><label htmlFor="cm-payee">Paid to</label><input id="cm-payee" value={form.payee} onChange={set("payee")} placeholder="Defaults to the insured" /></div>}
          <div className="field"><label htmlFor="cm-ref">Reference</label><input id="cm-ref" value={form.reference} onChange={set("reference")} placeholder="Cheque or transfer reference" /></div>
          <div className="field span-2"><label htmlFor="cm-notes">Notes</label><input id="cm-notes" value={form.notes} onChange={set("notes")} /></div>
        </div>
        <div className="form-actions"><button type="submit" className="btn" disabled={record.isPending}>{record.isPending ? "Recording…" : "Record"}</button></div>
      </form>
    </RoleGate>
  </div>;
}

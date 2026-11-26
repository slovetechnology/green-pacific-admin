import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import type { PremiumInvoice } from "../lib/premiumInvoices";

// Sets up, shows or cancels the instalment plan on an open premium invoice (backend premiumInvoices.js, G9).

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

function evenSplit(total: number, count: number, first: string) {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => ({
    due_date: addMonths(first, i),
    amount: ((i === count - 1 ? cents - each * (count - 1) : each) / 100).toFixed(2),
  }));
}

export function InstalmentPlanModal({ invoice, canWrite, onClose }: { invoice: PremiumInvoice; canWrite: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const plan = invoice.plan;
  const [count, setCount] = useState(3);
  const [first, setFirst] = useState(invoice.dueDate || new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState(() => evenSplit(invoice.amountDue, 3, invoice.dueDate || new Date().toISOString().slice(0, 10)));
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["premium-invoices"] });
  const create = useMutation({ mutationFn: () => api.post("/api/premium-invoices/plans", { invoice_key: invoice.invoiceKey, instalments: rows, notes }), onSuccess: () => { void refresh(); onClose(); } });
  const cancel = useMutation({ mutationFn: () => api.post(`/api/premium-invoices/plans/${plan!.id}/cancel`, { reason }), onSuccess: () => { void refresh(); onClose(); } });
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const resplit = (n: number, f: string) => { setCount(n); setFirst(f); setRows(evenSplit(invoice.amountDue, n, f)); };

  return (
    <Modal open title={`Instalments: ${invoice.debitNoteNo || "invoice"}, ${invoice.clientName}`} onClose={onClose} footer={
      plan ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {canWrite && <button type="button" className="btn btn-danger" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>Cancel the plan</button>}
        </>
      ) : (
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {canWrite && <button type="button" className="btn" disabled={create.isPending || Math.round(total * 100) !== Math.round(invoice.amountDue * 100)} onClick={() => create.mutate()}>Set up plan</button>}
        </>
      )
    }>
      {plan ? (
        <>
          {cancel.isError && <div className="flash flash-error">{(cancel.error as Error).message}</div>}
          <p style={{ marginTop: 0 }}>Plan of {fmtMoney(plan.total)}, {fmtMoney(plan.paid)} paid. Set up by {plan.created_by}.{plan.notes ? ` ${plan.notes}` : ""}</p>
          {plan.outsidePlan > 0 && <div className="flash flash-warning">{fmtMoney(plan.outsidePlan)} has been added to this debit note since the plan was made and is outside it.</div>}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>#</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th>State</th></tr></thead>
              <tbody>{plan.instalments.map((i) => (
                <tr key={i.seq}><td>{i.seq}</td><td>{i.due_date}</td><td className="num">{fmtMoney(i.amount)}</td><td className="num">{fmtMoney(i.paid)}</td><td>{i.state}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {canWrite && (
            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label htmlFor="ip_reason">Reason, to cancel the plan</label>
              <input id="ip_reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client paying the balance in full" />
            </div>
          )}
        </>
      ) : (
        <>
          {create.isError && <div className="flash flash-error">{(create.error as Error).message}</div>}
          <p style={{ marginTop: 0 }}>Split the {fmtMoney(invoice.amountDue)} owed into instalments. Each one is chased on its own at 15 and 30 days overdue.</p>
          <div className="form-grid">
            <div className="field"><label htmlFor="ip_count">Instalments</label><input id="ip_count" type="number" min={2} max={24} value={count} onChange={(e) => resplit(Math.min(24, Math.max(2, Number(e.target.value) || 2)), first)} /></div>
            <div className="field"><label htmlFor="ip_first">First due</label><input id="ip_first" type="date" value={first} onChange={(e) => resplit(count, e.target.value)} /></div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>#</th><th>Due</th><th className="num">Amount (NGN)</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input type="date" aria-label={`Instalment ${i + 1} due`} value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} /></td>
                  <td className="num"><input inputMode="decimal" aria-label={`Instalment ${i + 1} amount`} style={{ textAlign: "right" }} value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><th colSpan={2}>Total</th><th className="num">{fmtMoney(total)}</th></tr></tfoot>
            </table>
          </div>
          {Math.round(total * 100) !== Math.round(invoice.amountDue * 100) && <p className="text-muted">The instalments must add up to {fmtMoney(invoice.amountDue)}.</p>}
          <div className="field"><label htmlFor="ip_notes">Note (optional)</label><input id="ip_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Agreed with the client's finance team" /></div>
        </>
      )}
    </Modal>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtCurrency, fmtMoney } from "@/shared/lib/format";
import { OverpaymentAllocationModal } from "@/features/underwriting/endorsement-engine/components/OverpaymentAllocationModal";
import "@/shared/styles/endorsement-engine.css";

interface FormOptions {
  clients: { id: number; name: string }[];
  paymentMethods: string[];
}

interface OpenTransaction {
  id: number;
  policy_no: string | null;
  debit_note_no: string | null;
  class_of_business: string | null;
  status: string | null;
  premium_due: number;
  premium_paid: number;
  balance_os: number;
  // Premium not yet covered by a live receipt — outstanding balance plus
  // anything already recorded as paid but never receipted. This, not
  // balance_os, is what an allocation is capped at.
  receiptable: number;
  currency?: string;
  fx_rate?: number;
  insurer_name?: string | null;
  proportion?: number | null;
  // Set on each share of a co-insured policy (one transaction per insurer); shares of one policy share it.
  placement_key?: string | null;
}

const shareLabel = (t: OpenTransaction) => (t.placement_key ? `${t.insurer_name ?? "Insurer"} ${Number(((t.proportion ?? 1) * 100).toFixed(4))}%` : t.insurer_name ?? "");

interface AllocationRow {
  transaction_id: string;
  amount: string;
}

export function ReceiptFormPage() {
  const [searchParams] = useSearchParams();
  const preselectClientId = searchParams.get("client_id") || "";
  const preselectTransactionId = searchParams.get("transaction_id") || "";
  const returnTo = searchParams.get("return") || "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState(preselectClientId);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [vatLevies, setVatLevies] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [narration, setNarration] = useState("");
  // Currency (G8): a dollar, pound or euro receipt pays that currency's policies, in that currency.
  const [currency, setCurrency] = useState("NGN");
  const [fxRate, setFxRate] = useState("");
  const [allocations, setAllocations] = useState<AllocationRow[]>([{ transaction_id: "", amount: "" }]);
  // What the client actually transferred. Anything above the allocations + VAT + charges is an overpayment, held as
  // client credit (Client Unallocated Credit ledger, trust account) and settled in the allocation modal.
  const [amountReceived, setAmountReceived] = useState("");
  const [overpayment, setOverpayment] = useState<{ receiptId: number; creditEntryId: number; clientId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["receipts", "meta"],
    queryFn: () => api.get<FormOptions>("/api/receipts/meta/form-options"),
  });

  const openTxQuery = useQuery({
    queryKey: ["receipts", "open-tx", clientId],
    queryFn: () => api.get<{ transactions: OpenTransaction[] }>(`/api/receipts/client/${clientId}/open-transactions`),
    enabled: Boolean(clientId),
  });

  // Pre-fill one allocation row once the preselected client's open
  // transactions have loaded (Record Payment entry point from a
  // transaction's own detail page).
  useEffect(() => {
    if (!preselectTransactionId || !openTxQuery.data) return;
    const tx = openTxQuery.data.transactions.find((t) => String(t.id) === preselectTransactionId);
    if (tx) {
      setAllocations([{ transaction_id: String(tx.id), amount: String(tx.receiptable) }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTxQuery.data]);

  // In a foreign currency: only that currency's policies, with what is left to receipt in that currency.
  const openTransactions = (openTxQuery.data?.transactions || [])
    .filter((t) => currency === "NGN" || (t.currency || "NGN") === currency)
    .map((t) => (currency === "NGN" || !t.fx_rate ? t : { ...t, receiptable: Math.round((t.receiptable / Number(t.fx_rate)) * 100) / 100 }));
  const premiumTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const allocatedAmount = premiumTotal + (Number(vatLevies) || 0) + (Number(otherCharges) || 0);
  const received = amountReceived === "" ? allocatedAmount : Number(amountReceived) || 0;
  const excess = Math.max(Math.round((received - allocatedAmount) * 100) / 100, 0);
  const shortfall = amountReceived !== "" && received < allocatedAmount - 0.005;
  const totalAmount = allocatedAmount + excess;

  function updateAllocation(index: number, field: keyof AllocationRow, value: string) {
    setAllocations((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setAllocations((rows) => [...rows, { transaction_id: "", amount: "" }]);
  }

  // The other shares of a co-insured policy not yet on this receipt: a client pays the whole debit note.
  function otherShares(tx: OpenTransaction | undefined) {
    if (!tx?.placement_key) return [];
    const chosen = new Set(allocations.map((r) => r.transaction_id));
    return openTransactions.filter((t) => t.placement_key === tx.placement_key && !chosen.has(String(t.id)));
  }

  function addShares(tx: OpenTransaction) {
    const extra = otherShares(tx).map((t) => ({ transaction_id: String(t.id), amount: String(t.receiptable) }));
    setAllocations((rows) => [...rows.filter((r) => r.transaction_id), ...extra]);
  }

  function removeRow(index: number) {
    setAllocations((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Select a client.");
      return;
    }
    const validRows = allocations.filter((r) => r.transaction_id && Number(r.amount) > 0);
    if (validRows.length === 0 && excess <= 0) {
      setError("Add at least one policy allocation with a positive amount.");
      return;
    }
    if (shortfall) {
      setError("The amount received is less than the allocations. Reduce the allocations to what was received.");
      return;
    }
    if (totalAmount <= 0) {
      setError("Total amount received must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<{ receiptId: number; overpayment: { creditEntryId: number; amountCents: number } | null }>("/api/receipts", {
        client_id: clientId,
        receipt_date: receiptDate,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        vat_levies: vatLevies,
        other_charges: otherCharges,
        currency,
        fx_rate: currency === "NGN" ? undefined : fxRate,
        narration,
        allocations: validRows.map((r) => ({ transaction_id: r.transaction_id, amount: r.amount })),
        unallocated_amount: excess,
      });
      await queryClient.invalidateQueries({ queryKey: ["receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (result.overpayment) {
        // Ask straight away what to do with the excess; the receipt page opens when the modal closes.
        setOverpayment({ receiptId: result.receiptId, creditEntryId: result.overpayment.creditEntryId, clientId: Number(clientId) });
        return;
      }
      // Entered from a transaction's edit form (the "select Paid, record a
      // receipt, come back to save" workflow) — go back there instead of the
      // receipt detail page; the invalidated ["transactions", txId] query
      // means the form reloads with the receipt_no just stamped by createReceipt
      // already filled in, no need to pass it through the URL.
      navigate(returnTo || `/receipts/${result.receiptId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const opts = optionsQuery.data;
  const clientLocked = Boolean(preselectClientId);

  return (
    <div>
      <div className="page-header">
        <h1>New Receipt</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="client_id">Client</label>
              <select
                id="client_id"
                required
                disabled={clientLocked}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setAllocations([{ transaction_id: "", amount: "" }]);
                }}
              >
                <option value="">— Select client —</option>
                {opts?.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="receipt_date">Receipt Date</label>
              <input id="receipt_date" type="date" required value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="receipt_currency">Currency</label>
              <select id="receipt_currency" value={currency} onChange={(e) => { setCurrency(e.target.value); setAllocations([{ transaction_id: "", amount: "" }]); }}>
                {["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c} value={c}>{c === "NGN" ? "Naira (NGN)" : c}</option>)}
              </select>
            </div>
            {currency !== "NGN" && (
              <div className="field">
                <label htmlFor="receipt_fx_rate">Rate received (NGN per {currency})</label>
                <input id="receipt_fx_rate" inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="Blank: the CBN rate on the receipt date" />
                <small className="text-muted">Amounts are in {currency}. Any difference from each policy's booked rate is an exchange gain or loss.</small>
              </div>
            )}
            <div className="field">
              <label htmlFor="payment_method">Payment Method</label>
              <select id="payment_method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {(opts?.paymentMethods || ["Cash"]).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="payment_reference">Payment Reference</label>
              <input id="payment_reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Bank ref / cheque no." />
            </div>
            <div className="field">
              <label htmlFor="vat_levies">VAT / Levies</label>
              <input id="vat_levies" type="number" step="0.01" value={vatLevies} onChange={(e) => setVatLevies(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="other_charges">Other Charges</label>
              <input id="other_charges" type="number" step="0.01" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} />
            </div>
            <div className="field span-3">
              <label htmlFor="narration">Narration (optional)</label>
              <textarea id="narration" rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </div>

          <h2>Payment Allocation</h2>
          {!clientId && <p className="empty-state">Select a client to choose policies to allocate this payment against.</p>}
          {clientId && !openTxQuery.isLoading && openTransactions.length === 0 && (
            <p className="empty-state">
              This client has nothing left to receipt — every transaction on file for them is either cancelled or already covered
              in full by a receipt.
            </p>
          )}
          {clientId && (openTxQuery.isLoading || openTransactions.length > 0) && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th className="num">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((row, i) => {
                    const selected = openTransactions.find((t) => String(t.id) === row.transaction_id);
                    return (
                      <tr key={i}>
                        <td>
                          <select
                            value={row.transaction_id}
                            onChange={(e) => {
                              const txId = e.target.value;
                              const tx = openTransactions.find((t) => String(t.id) === txId);
                              // Suggest the full receiptable amount as a real, editable
                              // value (not just a placeholder) so staff can see it's
                              // actually there — but don't clobber an amount they've
                              // already typed in this row (e.g. reconsidering the policy
                              // after starting to enter a partial amount).
                              setAllocations((rows) =>
                                rows.map((r, idx) => {
                                  if (idx !== i) return r;
                                  const amount = r.amount === "" && tx ? String(tx.receiptable) : r.amount;
                                  return { transaction_id: txId, amount };
                                })
                              );
                            }}
                          >
                            <option value="">— Select policy —</option>
                            {openTransactions.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.policy_no || `#${t.id}`} — {t.class_of_business || "—"}
                                {shareLabel(t) ? ` — ${t.placement_key ? "co-insured, " : ""}${shareLabel(t)}` : ""} (
                                {currency !== "NGN"
                                  ? `To receipt: ${fmtCurrency(t.receiptable, currency)}`
                                  : t.balance_os > 0.01
                                  ? `Balance: ${fmtMoney(t.balance_os)}`
                                  : `Paid — ${fmtCurrency(t.receiptable, currency)} to receipt`}
                                )
                              </option>
                            ))}
                          </select>
                          {otherShares(selected).length > 0 && (
                            <div style={{ marginTop: "0.35rem" }}>
                              <small>
                                Co-insured: {otherShares(selected).map(shareLabel).join(", ")} {otherShares(selected).length === 1 ? "is" : "are"} not on this receipt.{" "}
                              </small>
                              <button type="button" className="btn-secondary btn btn-sm" onClick={() => selected && addShares(selected)}>
                                Add {otherShares(selected).length === 1 ? "that share" : "those shares"}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) => updateAllocation(i, "amount", e.target.value)}
                            placeholder={selected ? String(selected.receiptable) : ""}
                          />
                        </td>
                        <td>
                          {allocations.length > 1 && (
                            <button type="button" className="btn-danger btn btn-sm" onClick={() => removeRow(i)}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={2}>
                      <button type="button" className="btn-secondary btn btn-sm" onClick={addRow}>
                        + Add policy
                      </button>
                    </td>
                    <td></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>Premium Total</strong></td>
                    <td className="num"><strong>{fmtCurrency(premiumTotal, currency)}</strong></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>
                      <label htmlFor="amount_received"><strong>Amount actually received</strong></label>
                      <div className="text-muted">Leave blank if it equals the allocations. More than that is an overpayment.</div>
                    </td>
                    <td className="num">
                      <input id="amount_received" type="number" step="0.01" min="0" value={amountReceived}
                        placeholder={allocatedAmount.toFixed(2)} onChange={(e) => setAmountReceived(e.target.value)} />
                    </td>
                    <td></td>
                  </tr>
                  {excess > 0 && (
                    <tr>
                      <td><strong>Overpayment → client credit</strong> <span className="ee-chip is-info">Client Unallocated Credit (trust)</span></td>
                      <td className="num"><strong>{fmtMoney(excess)}</strong></td>
                      <td></td>
                    </tr>
                  )}
                  {shortfall && (
                    <tr><td colSpan={3} className="flash flash-error">Received is less than the allocations.</td></tr>
                  )}
                  <tr>
                    <td><strong>Total Amount Received</strong></td>
                    <td className="num"><strong>{fmtCurrency(totalAmount, currency)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : "Record Receipt"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
      {overpayment && (
        <OverpaymentAllocationModal
          open
          clientId={overpayment.clientId}
          sourceEntryId={overpayment.creditEntryId}
          onClose={() => navigate(returnTo || `/receipts/${overpayment.receiptId}`)}
        />
      )}
    </div>
  );
}

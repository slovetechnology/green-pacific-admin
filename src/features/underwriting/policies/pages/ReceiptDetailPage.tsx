import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { EmailDocumentForm } from "@/shared/components/EmailDocumentForm";

interface Receipt {
  id: number;
  receipt_no: string;
  receipt_date: string;
  client_id: number;
  payment_method: string;
  payment_reference: string | null;
  vat_levies: number;
  other_charges: number;
  total_amount: number;
  narration: string | null;
  status: string;
  cancel_reason: string | null;
}

interface Client {
  id: number;
  name: string;
  client_ref: string | null;
}

interface Allocation {
  id: number;
  amount: number;
  transaction_id: number;
  policy_no: string | null;
  debit_note_no: string | null;
  class_of_business: string | null;
  insurer_name: string;
  balance_os: number;
}

interface Response {
  receipt: Receipt;
  client: Client;
  allocations: Allocation[];
}

export function ReceiptDetailPage() {
  const { receiptId } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["receipts", receiptId],
    queryFn: () => api.get<Response>(`/api/receipts/${receiptId}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Receipt not found.</p>;
  const { receipt, client, allocations } = data;
  const premium = allocations.reduce((s, a) => s + a.amount, 0);

  async function handleCancel() {
    const reason = window.prompt("Reason for cancelling this receipt:");
    if (reason === null) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/receipts/${receiptId}/cancel`, { reason });
      await queryClient.invalidateQueries({ queryKey: ["receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel receipt.");
    } finally {
      setBusy(false);
    }
  }

  function openEmail() {
    setError(null);
    setMessage(null);
    setEmailOpen(true);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            <Link to={`/clients/${client.id}`}>{client.name}</Link>
          </p>
          <h1>{receipt.receipt_no}</h1>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={receipt.status} />
          <a className="btn-secondary btn" href={apiUrl(`/api/receipts/${receiptId}/pdf?inline=1`)} target="_blank" rel="noreferrer">
            Preview
          </a>
          <a className="btn-secondary btn" href={apiUrl(`/api/receipts/${receiptId}/pdf`)}>Download PDF</a>
          <RoleGate need="write">
            <button type="button" className="btn-secondary btn" disabled={busy} onClick={openEmail}>
              Email Receipt
            </button>
            {receipt.status === "Active" && (
              <button type="button" className="btn-danger btn" disabled={busy} onClick={handleCancel}>
                Cancel Receipt
              </button>
            )}
          </RoleGate>
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}
      {emailOpen && (
        <EmailDocumentForm
          title="Email Receipt"
          documentLabel="receipt"
          clientName={client.name}
          optionsUrl={`/api/receipts/${receiptId}/email-options`}
          sendUrl={`/api/receipts/${receiptId}/email`}
          onSent={(msg) => {
            setMessage(msg);
            setEmailOpen(false);
          }}
          onClose={() => setEmailOpen(false)}
        />
      )}
      {message && <div className="flash">{message}</div>}
      {receipt.status === "Cancelled" && receipt.cancel_reason && (
        <div className="flash flash-error">Cancelled: {receipt.cancel_reason}</div>
      )}

      <div className="card">
        <h2>Payment Details</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Receipt Date</div>
            <div className="v">{receipt.receipt_date}</div>
          </div>
          <div>
            <div className="k">Payment Method</div>
            <div className="v">{receipt.payment_method}</div>
          </div>
          <div>
            <div className="k">Payment Reference</div>
            <div className="v">{receipt.payment_reference || "—"}</div>
          </div>
          <div>
            <div className="k">Insurance Premium</div>
            <div className="v">{fmtMoney(premium)}</div>
          </div>
          <div>
            <div className="k">VAT / Levies</div>
            <div className="v">{fmtMoney(receipt.vat_levies)}</div>
          </div>
          <div>
            <div className="k">Other Charges</div>
            <div className="v">{fmtMoney(receipt.other_charges)}</div>
          </div>
          <div>
            <div className="k">Total Amount Received</div>
            <div className="v"><strong>{fmtMoney(receipt.total_amount)}</strong></div>
          </div>
        </div>
        {receipt.narration && (
          <>
            <div className="section-title">Narration</div>
            <p>{receipt.narration}</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Payment Allocation</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy No</th>
                <th>Invoice No</th>
                <th>Insurer</th>
                <th>Class of Business</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/transactions/${a.transaction_id}`}>{a.policy_no || `#${a.transaction_id}`}</Link>
                  </td>
                  <td>{a.debit_note_no || "—"}</td>
                  <td>{a.insurer_name}</td>
                  <td>{a.class_of_business || "—"}</td>
                  <td className="num">{fmtMoney(a.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total</strong></td>
                <td className="num"><strong>{fmtMoney(premium)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

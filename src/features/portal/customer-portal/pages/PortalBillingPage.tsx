import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";

interface Tx {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  premium_due: number;
  premium_paid: number;
  balance_os: number;
  status: string;
  end_date: string | null;
  date_of_payment: string | null;
  // Set on a co-insured policy: its insurers and shares. The row is the whole policy (the server adds the
  // insurers' shares together), and paying it pays every share.
  insurers?: string | null;
}

interface BillingResponse {
  outstanding: Tx[];
  history: Tx[];
  bankName: string;
  accountName: string;
  accountNumber: string;
  paystackEnabled: boolean;
}

export function PortalBillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [flash, setFlash] = useState<string | null>(searchParams.get("flash"));
  const [busyTxId, setBusyTxId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("flash")) {
      const next = new URLSearchParams(searchParams);
      next.delete("flash");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "billing"],
    queryFn: () => api.get<BillingResponse>("/api/portal/billing"),
  });

  async function handleNotifyPayment(txId: number) {
    setError(null);
    setBusyTxId(txId);
    try {
      await api.post(`/api/portal/billing/${txId}/notify-payment`);
      await queryClient.invalidateQueries({ queryKey: ["portal", "billing"] });
      setFlash("Thanks — we've notified your broker to confirm your payment. This can take up to one business day.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusyTxId(null);
    }
  }

  async function handlePayOnline(txId: number) {
    setError(null);
    setBusyTxId(txId);
    try {
      const result = await api.post<{ authorizationUrl: string }>(`/api/portal/billing/${txId}/pay`);
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start online payment.");
      setBusyTxId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>Billing</h1>
        </div>
      </div>

      {flash && <div className="flash flash-success">{flash}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      {isLoading && <p>Loading…</p>}

      {data && (
        <>
          <div className="card">
            <h2>Outstanding Balances</h2>
            {(data.bankName || data.paystackEnabled) && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {data.paystackEnabled && "Pay online instantly with a card, or "}
                pay by bank transfer to{" "}
                {data.bankName ? (
                  <>
                    <strong>{data.bankName}</strong>, account name <strong>{data.accountName}</strong>, account
                    number <strong>{data.accountNumber}</strong>
                  </>
                ) : (
                  "the bank details on file with your broker"
                )}
                {" "}— then let us know below so we can confirm your payment.
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Policy No</th>
                    <th>Class of Business</th>
                    <th className="num">Premium Due</th>
                    <th className="num">Balance</th>
                    <th>Renewal Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.outstanding.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">Nothing outstanding — you're all paid up.</td>
                    </tr>
                  )}
                  {data.outstanding.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        {tx.policy_no || "—"}
                        {tx.insurers && <div><small>Co-insured: {tx.insurers}</small></div>}
                      </td>
                      <td>{tx.class_of_business || "—"}</td>
                      <td className="num">{fmtMoney(tx.premium_due)}</td>
                      <td className="num">{fmtMoney(tx.balance_os)}</td>
                      <td>{tx.end_date || "—"}</td>
                      <td className="actions-row">
                        {data.paystackEnabled && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busyTxId === tx.id}
                            onClick={() => handlePayOnline(tx.id)}
                          >
                            {busyTxId === tx.id ? "Redirecting…" : "Pay online"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busyTxId === tx.id}
                          onClick={() => handleNotifyPayment(tx.id)}
                        >
                          I've paid by transfer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Payment History</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Policy No</th>
                    <th className="num">Premium Paid</th>
                    <th>Date of Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-state">No payment history yet.</td>
                    </tr>
                  )}
                  {data.history.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        {tx.policy_no || "—"}
                        {tx.insurers && <div><small>Co-insured: {tx.insurers}</small></div>}
                      </td>
                      <td className="num">{fmtMoney(tx.premium_paid)}</td>
                      <td>{tx.date_of_payment || "—"}</td>
                      <td>
                        <StatusBadge status={tx.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

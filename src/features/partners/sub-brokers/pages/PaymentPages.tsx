import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useSubBrokerMeta, type CommissionLine, type LineTotals, type SubBroker, type SubBrokerPayment } from "../lib/subBrokers";
import { LinesTable } from "../components/LedgerTabs";

const today = () => new Date().toISOString().slice(0, 10);
const cents = (n: number) => Math.round(n * 100);

// Payment batch: pick Payable lines (clawbacks net off against new
// commission), record how it was paid, and the lines go to Paid. The bank
// details are snapshotted onto the payment (backend lib/subBrokerLedger.js).
export function PaymentBatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { meta, can } = useSubBrokerMeta();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sb = useQuery({ queryKey: ["sub-brokers", id], queryFn: () => api.get<{ subBroker: SubBroker }>(`/api/sub-brokers/${id}`) });
  const payable = useQuery({
    queryKey: ["sub-brokers", id, "payable"],
    queryFn: () => api.get<{ lines: CommissionLine[]; totals: LineTotals }>(`/api/sub-brokers/${id}/payable`),
  });
  useEffect(() => {
    if (payable.data) setSelected(new Set(payable.data.lines.map((l) => l.id)));
  }, [payable.data]);

  const lines = payable.data?.lines ?? [];
  const chosen = lines.filter((l) => selected.has(l.id));
  const totalCents = chosen.reduce((s, l) => s + cents(l.net), 0);
  const subBroker = sb.data?.subBroker;

  const pay = useMutation({
    mutationFn: () => api.post<{ payment: SubBrokerPayment }>(`/api/sub-brokers/${id}/payments`, {
      line_ids: chosen.map((l) => l.id), payment_date: date, method, reference: reference || undefined, notes: notes || undefined,
    }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["sub-brokers"] });
      navigate(`/sub-brokers/payments/${res.payment.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "The payment could not be recorded."),
  });

  if (meta && !can("subbroker.pay")) return <div className="flash flash-error">You don't have permission to make sub-broker payments.</div>;
  if (!subBroker) return <p className="exec-state">Loading…</p>;
  const blocked = subBroker.status === "Suspended" ? "Payments to a suspended sub-broker are on hold." : !subBroker.account_number ? "No bank details are on file; add them on the profile first." : null;

  function toggle(lineId: number) {
    setSelected((s) => { const n = new Set(s); if (n.has(lineId)) n.delete(lineId); else n.add(lineId); return n; });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{subBroker.reference_no}</p>
          <h1>Pay commission — {subBroker.name}</h1>
        </div>
        <div className="page-header-actions">
          {["pdf", "excel", "csv"].map((f) => (
            <a key={f} className="btn-secondary btn" href={apiUrl(`/api/sub-brokers/${subBroker.id}/payable/${f}`)}>Schedule {f === "excel" ? "Excel" : f.toUpperCase()}</a>
          ))}
          <Link className="btn-secondary btn" to={`/sub-brokers/${subBroker.id}?tab=payments`}>Back</Link>
        </div>
      </div>
      {blocked && <div className="flash flash-warning">{blocked}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <h2>Payable commission lines</h2>
        <p className="muted">Net payable is after VAT, NAICOM levy and misc deductions. A negative line is a clawback; include it to net it off.</p>
        {payable.isLoading ? <p className="exec-state">Loading…</p> : lines.length === 0 ? <p className="exec-state">Nothing is payable right now.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select all" checked={selected.size === lines.length} onChange={(e) => setSelected(e.target.checked ? new Set(lines.map((l) => l.id)) : new Set())} /></th>
                  <th>Date</th><th>Policy</th><th>Insured</th><th className="num">Gross share</th><th className="num">Deductions</th><th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" aria-label={`Select line ${l.id}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td>{l.lineDate}</td>
                    <td><Link to={`/transactions/${l.transactionId}`}>{l.policyNo || `#${l.transactionId}`}</Link>{l.kind === "Reversal" ? " · reversal" : ""}</td>
                    <td>{l.insured}</td>
                    <td className="num">{fmtMoney(l.grossShare)}</td>
                    <td className="num">{fmtMoney(l.vat + l.naicomLevy + l.misc)}</td>
                    <td className="num"><strong>{fmtMoney(l.net)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={6}>Selected ({chosen.length})</td><td className="num">{fmtMoney(totalCents / 100)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Payment details</h2>
        <div className="detail-grid" style={{ marginBottom: "1rem" }}>
          <div><div className="k">Pay to</div><div className="v">{subBroker.account_name || "—"}</div></div>
          <div><div className="k">Bank</div><div className="v">{subBroker.bank_name || "—"}</div></div>
          <div><div className="k">Account number</div><div className="v">{subBroker.account_number || "—"}</div></div>
        </div>
        <div className="form-grid">
          <div className="field"><label htmlFor="pd">Payment date</label><input id="pd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="pm">Method</label>
            <select id="pm" value={method} onChange={(e) => setMethod(e.target.value)}>{(meta?.paymentMethods ?? ["Bank Transfer"]).map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="pr">Reference (optional)</label><input id="pr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Generated if blank" /></div>
          <div className="field span-3"><label htmlFor="pn">Notes</label><input id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        {totalCents <= 0 && chosen.length > 0 && <div className="flash flash-warning">The selected lines net to {fmtMoney(totalCents / 100)}; select more lines to make a payment.</div>}
        <div className="form-actions">
          <button type="button" className="btn" disabled={!!blocked || totalCents <= 0 || pay.isPending}
            onClick={() => { setError(null); if (window.confirm(`Pay ${fmtMoney(totalCents / 100)} to ${subBroker.name} (${subBroker.bank_name} ${subBroker.account_number})?`)) pay.mutate(); }}>
            {pay.isPending ? "Recording…" : `Record payment of ${fmtMoney(totalCents / 100)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PaymentResponse { payment: SubBrokerPayment; lines: CommissionLine[] }

// A payment voucher, with void and void-and-reissue for corrections.
export function PaymentDetailPage() {
  const { paymentId } = useParams();
  const queryClient = useQueryClient();
  const { can } = useSubBrokerMeta();
  const [reason, setReason] = useState("");
  const [reissue, setReissue] = useState(true);
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [keep, setKeep] = useState<Set<number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sub-brokers", "payment", paymentId],
    queryFn: () => api.get<PaymentResponse>(`/api/sub-brokers/payments/${paymentId}`),
  });
  const voidIt = useMutation({
    mutationFn: () => api.post<{ replacement: PaymentResponse | null }>(`/api/sub-brokers/payments/${paymentId}/void`, {
      reason,
      reissue: reissue ? { payment_date: date, method, line_ids: [...(keep ?? new Set((data?.lines ?? []).map((l) => l.id)))] } : null,
    }),
    onSuccess: async () => { setError(null); setReason(""); await queryClient.invalidateQueries({ queryKey: ["sub-brokers"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not void the payment."),
  });

  if (isLoading) return <p className="exec-state">Loading…</p>;
  if (!data) return <div className="flash flash-error">Payment not found.</div>;
  const p = data.payment;
  const keepSet = keep ?? new Set(data.lines.map((l) => l.id));
  const kv = (k: string, v: React.ReactNode) => (<div><div className="k">{k}</div><div className="v">{v || "—"}</div></div>);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Payment voucher</p>
          <h1>{p.reference} {p.voided_at ? <StatusBadge status="Void" /> : <StatusBadge status="Paid" />}</h1>
        </div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to={`/sub-brokers/${p.sub_broker_id}?tab=payments`}>Back</Link>
          {["pdf", "excel", "csv"].map((f) => (
            <a key={f} className="btn-secondary btn" href={apiUrl(`/api/sub-brokers/payments/${p.id}/${f}`)}>{f === "excel" ? "Excel" : f.toUpperCase()}</a>
          ))}
          <button type="button" className="btn-secondary btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      <div className="card">
        <div className="detail-grid">
          {kv("Sub-broker", <Link to={`/sub-brokers/${p.sub_broker_id}`}>{p.reference_no} · {p.sub_broker_name}</Link>)}
          {kv("Payment date", p.payment_date)}
          {kv("Method", p.method)}
          {kv("Amount", <strong>{fmtMoney(p.total)}</strong>)}
          {kv("Bank", p.bank_name)}
          {kv("Account name", p.account_name)}
          {kv("Account number", p.account_number)}
          {kv("Recorded by", p.created_by)}
        </div>
        {p.notes && <p style={{ marginTop: "1rem" }}>{p.notes}</p>}
        {p.voided_at && (
          <div className="flash flash-warning" style={{ marginTop: "1rem" }}>
            Voided {p.voided_at} by {p.voided_by}: {p.void_reason}.{" "}
            {p.reissued_as_payment_id ? <Link to={`/sub-brokers/payments/${p.reissued_as_payment_id}`}>See the reissued payment</Link> : "Its lines are payable again."}
          </div>
        )}
      </div>
      <div className="card">
        <h2>Commission paid</h2>
        <LinesTable lines={data.lines} />
      </div>

      {can("subbroker.pay") && !p.voided_at && (
        <div className="card">
          <h2>Void this payment</h2>
          <p className="muted">Use this when a payment was wrong. The voucher stays on record, flagged void, and its lines become payable again. Reissue replaces it in one step.</p>
          {error && <div className="flash flash-error">{error}</div>}
          <div className="form-grid">
            <div className="field span-3"><label htmlFor="vr">Reason (required)</label><input id="vr" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <label style={{ display: "block", margin: "0.75rem 0" }}>
            <input type="checkbox" checked={reissue} onChange={(e) => setReissue(e.target.checked)} /> Reissue a corrected payment
          </label>
          {reissue && (
            <>
              <div className="form-grid">
                <div className="field"><label htmlFor="rd">New payment date</label><input id="rd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="field"><label htmlFor="rm">Method</label>
                  <select id="rm" value={method} onChange={(e) => setMethod(e.target.value)}>{["Bank Transfer", "Cheque", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}</select>
                </div>
              </div>
              <p className="muted">Lines to include in the replacement (clear any that need correcting first):</p>
              {data.lines.map((l) => (
                <label key={l.id} style={{ display: "block" }}>
                  <input type="checkbox" checked={keepSet.has(l.id)} onChange={() => { const n = new Set(keepSet); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); setKeep(n); }} /> {l.policyNo || `#${l.transactionId}`} — {l.insured} — {fmtMoney(l.net)}
                </label>
              ))}
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" disabled={!reason.trim() || voidIt.isPending || (reissue && keepSet.size === 0)}
              onClick={() => { if (window.confirm(`Void payment ${p.reference}?`)) voidIt.mutate(); }}>
              {reissue ? "Void and reissue" : "Void payment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

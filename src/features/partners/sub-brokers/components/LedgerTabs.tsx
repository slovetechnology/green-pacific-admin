import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useSubBrokerMeta, type CommissionLine, type LineTotals, type SubBroker, type SubBrokerPayment } from "../lib/subBrokers";

const panel = (id: string, children: React.ReactNode) => (
  <div role="tabpanel" id={`sb-panel-${id}`} aria-labelledby={`sb-tab-${id}`} tabIndex={0} className="exec-tabpanel">{children}</div>
);

// ---- Business: policies attached to this sub-broker ----------------------------------
interface BusinessRow {
  id: number; trans_date: string | null; policy_no: string | null; slip_no: string | null; class_of_business: string | null;
  premium_due: number; total_brokerage: number; status: string | null; billing_mode: string; channel: string | null;
  split_percent: number; client_name: string; grossShare: number; net: number;
}

export function BusinessTab({ subBroker }: { subBroker: SubBroker }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "business"],
    queryFn: () => api.get<{ business: BusinessRow[] }>(`/api/sub-brokers/${subBroker.id}/business`),
  });
  const rows = data?.business ?? [];
  return panel("business", (
    <div className="card">
      <h2>Business through this sub-broker</h2>
      <p className="muted">Attach a sub-broker to a policy from the policy's page. The split shown was fixed when the business was attached.</p>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Policy</th><th>Insured</th><th>Class</th><th>Channel</th><th className="num">Premium</th><th className="num">Brokerage</th><th className="num">Split</th><th className="num">Gross share</th><th className="num">Net</th><th>Status</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={11}>Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={11}>No business attached yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.trans_date || "—"}</td>
                <td><Link to={`/transactions/${r.id}`}>{r.policy_no || `#${r.id}`}</Link>{r.billing_mode === "Direct" ? " · Direct Bill" : ""}</td>
                <td>{r.client_name}</td>
                <td>{r.class_of_business || "—"}</td>
                <td>{r.channel === "Placed" ? "Placed through" : "Received through"}</td>
                <td className="num">{fmtMoney(r.premium_due)}</td>
                <td className="num">{fmtMoney(r.total_brokerage)}</td>
                <td className="num">{r.split_percent}%</td>
                <td className="num">{fmtMoney(r.grossShare)}</td>
                <td className="num">{fmtMoney(r.net)}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}

// ---- Statement -------------------------------------------------------------------------
export function LinesTable({ lines, totals }: { lines: CommissionLine[]; totals?: LineTotals }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Policy / slip</th><th>Insured</th><th>Class</th><th className="num">Premium</th><th className="num">Gross commission</th>
            <th className="num">Split</th><th className="num">Gross share</th><th className="num">VAT</th><th className="num">NAICOM levy</th>
            <th className="num">Misc</th><th className="num">Net payable</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {!lines.length && <tr><td colSpan={13}>No commission lines in this range.</td></tr>}
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{l.lineDate}</td>
              <td><Link to={`/transactions/${l.transactionId}`}>{l.policyNo || `#${l.transactionId}`}</Link>{l.slipNo ? <div className="exec-dl-note">{l.slipNo}</div> : null}</td>
              <td>{l.insured}</td>
              <td>{l.classOfBusiness || "—"}</td>
              <td className="num">{fmtMoney(l.premium)}</td>
              <td className="num">{fmtMoney(l.grossCommission)}</td>
              <td className="num">{l.splitPercent}%</td>
              <td className="num">{fmtMoney(l.grossShare)}</td>
              <td className="num" title={`${l.vatRate}%`}>{fmtMoney(l.vat)}</td>
              <td className="num" title={`${l.naicomLevyRate}%`}>{fmtMoney(l.naicomLevy)}</td>
              <td className="num" title={`${l.miscRate}%`}>{fmtMoney(l.misc)}</td>
              <td className="num"><strong>{fmtMoney(l.net)}</strong></td>
              <td><StatusBadge status={l.kind === "Reversal" && l.status !== "Reversed" ? "Reversal" : l.status} />{l.paymentReference ? <div className="exec-dl-note">{l.paymentReference}</div> : null}</td>
            </tr>
          ))}
        </tbody>
        {totals && lines.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={5}>Total</td>
              <td className="num">{fmtMoney(totals.grossCommission)}</td><td />
              <td className="num">{fmtMoney(totals.grossShare)}</td><td className="num">{fmtMoney(totals.vat)}</td>
              <td className="num">{fmtMoney(totals.naicomLevy)}</td><td className="num">{fmtMoney(totals.misc)}</td>
              <td className="num">{fmtMoney(totals.net)}</td><td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function StatementTab({ subBroker }: { subBroker: SubBroker }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (status) qs.set("status", status);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "statement", qs.toString()],
    queryFn: () => api.get<{ lines: CommissionLine[]; totals: LineTotals }>(`/api/sub-brokers/${subBroker.id}/statement?${qs.toString()}`),
  });
  return panel("statement", (
    <div className="card">
      <div className="page-header" style={{ border: 0, marginBottom: 0 }}>
        <h2>Commission statement</h2>
        <div className="page-header-actions">
          {["pdf", "excel", "csv"].map((f) => (
            <a key={f} className="btn-secondary btn btn-sm" href={apiUrl(`/api/sub-brokers/${subBroker.id}/statement/${f}?${qs.toString()}`)}>{f === "excel" ? "Excel" : f.toUpperCase()}</a>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["Accrued", "Payable", "Paid", "Reversed"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the statement."}</div>}
      {isLoading ? <p className="exec-state">Loading…</p> : <LinesTable lines={data?.lines ?? []} totals={data?.totals} />}
    </div>
  ));
}

// ---- Payments --------------------------------------------------------------------------
export function PaymentsTab({ subBroker }: { subBroker: SubBroker }) {
  const { can } = useSubBrokerMeta();
  const { data, isLoading } = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "payments"],
    queryFn: () => api.get<{ payments: SubBrokerPayment[] }>(`/api/sub-brokers/${subBroker.id}/payments`),
  });
  const rows = data?.payments ?? [];
  return panel("payments", (
    <div className="card">
      <div className="page-header" style={{ border: 0, marginBottom: 0 }}>
        <h2>Payments</h2>
        {can("subbroker.pay") && <Link className="btn" to={`/sub-brokers/${subBroker.id}/pay`}>New payment batch</Link>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Paid to</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={6}>No payments yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/sub-brokers/payments/${p.id}`}>{p.reference}</Link></td>
                <td>{p.payment_date}</td>
                <td>{p.method}</td>
                <td>{p.bank_name} · {p.account_number}</td>
                <td className="num">{fmtMoney(p.total)}</td>
                <td>{p.voided_at ? <StatusBadge status="Void" /> : <StatusBadge status="Paid" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}

// ---- Documents -------------------------------------------------------------------------
interface Doc { id: number; doc_type: string | null; original_name: string; uploaded_by: string | null; created_at: string }

export function DocumentsTab({ subBroker }: { subBroker: SubBroker }) {
  const queryClient = useQueryClient();
  const { can } = useSubBrokerMeta();
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "documents"],
    queryFn: () => api.get<{ documents: Doc[] }>(`/api/sub-brokers/${subBroker.id}/documents`),
  });

  async function upload() {
    if (!file) return setError("Choose a file first.");
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      await api.upload(`/api/sub-brokers/${subBroker.id}/documents`, fd);
      setFile(null);
      setDocType("");
      await queryClient.invalidateQueries({ queryKey: ["sub-brokers", subBroker.id] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return panel("documents", (
    <div className="card">
      <h2>Supporting documents</h2>
      {error && <div className="flash flash-error">{error}</div>}
      {can("subbroker.edit") && (
        <div className="toolbar">
          <input aria-label="Document type" placeholder="Type (e.g. CAC certificate, ID, agreement)" value={docType} onChange={(e) => setDocType(e.target.value)} />
          <input aria-label="File" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn" disabled={busy} onClick={upload}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Type</th><th>File</th><th>Uploaded by</th><th>On</th></tr></thead>
          <tbody>
            {!data?.documents.length && <tr><td colSpan={4}>No documents uploaded.</td></tr>}
            {data?.documents.map((d) => (
              <tr key={d.id}>
                <td>{d.doc_type || "—"}</td>
                <td><a href={apiUrl(`/api/sub-brokers/documents/${d.id}/file`)}>{d.original_name}</a></td>
                <td>{d.uploaded_by || "—"}</td>
                <td>{d.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}

// ---- Audit -------------------------------------------------------------------------------
interface AuditEntry { id: number; actor: string; action: string; entity_type: string; summary: string | null; created_at: string; changes: Record<string, { from?: unknown; to?: unknown; changed?: boolean }> | null }

export function AuditTab({ subBroker }: { subBroker: SubBroker }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "audit"],
    queryFn: () => api.get<{ entries: AuditEntry[] }>(`/api/sub-brokers/${subBroker.id}/audit`),
  });
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return panel("audit", (
    <div className="card">
      <h2>Audit trail</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Before → after</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
            {!isLoading && !data?.entries.length && <tr><td colSpan={4}>No entries.</td></tr>}
            {data?.entries.map((a) => (
              <tr key={a.id}>
                <td>{a.created_at}</td>
                <td>{a.actor}</td>
                <td>{a.summary || `${a.action} ${a.entity_type}`}</td>
                <td className="wrap">
                  {a.changes ? Object.entries(a.changes).map(([k, v]) => (
                    <div key={k}><strong>{k}</strong>: {v.changed ? "changed" : `${show(v.from)} → ${show(v.to)}`}</div>
                  )) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}

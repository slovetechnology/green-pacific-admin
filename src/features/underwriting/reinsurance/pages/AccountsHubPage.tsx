import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { errorText, minorText, useReinsuranceStatus } from "../lib/reinsurance";
import { promptDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/reinsurance.css";

interface Alert { billing_id: number; billing_ref: string; placement_id: number; currency: string; amount_minor: number; severity: "high" | "medium"; kind: string; message: string }
interface Ageing { currency: string; kind: string; total_minor: number; buckets: { label: string; minor: number; count: number }[] }
interface Check { name: string; ledger_minor: number; subledger_minor: number; difference_minor: number; ok: boolean }
interface Recon {
  currency: string; ok: boolean; checks: Check[]; bank: null | { statement_date: string; statement_minor: number; ledger_minor: number; difference_minor: number; ok: boolean };
  unremitted: { billing_id: number; billing_ref: string; allowable_minor: number }[]; brokerage: { earned_in_cash_minor: number; moved_minor: number; available_minor: number };
}
interface Pending {
  remittances: { id: number; remit_ref: string; billing_id: number; billing_ref: string; kind: string; payee_name: string; amount_minor: number; currency: string; paid_date: string; requested_by: string }[];
  brokerageTransfers: { id: number; amount_minor: number; currency: string; transfer_date: string; requested_by: string }[];
  setoffs: { id: number; amount_minor: number; currency: string; set_date: string; requested_by: string }[];
  manualJournals: { id: number; description: string; currency: string; entry_date: string; requested_by: string; lines: { role: string; debit_minor: number; credit_minor: number }[] }[];
  mappings: { id: number; role: string; account_code: string; effective_from: string; proposed_by: string }[];
}

// Where the money stands: what is overdue, how old the debts are, whether the ledger agrees with the
// sub-ledgers, and what is waiting for a second person.
export function AccountsHubPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can, isLoading } = useReinsuranceStatus();
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tx, setTx] = useState({ amount: "", transfer_date: "", bank_ref: "" });
  const on = can("ri.view");
  const alerts = useQuery({ queryKey: ["ri", "alerts"], queryFn: () => api.get<{ alerts: Alert[] }>("/api/reinsurance/accounting/alerts"), enabled: on });
  const ageing = useQuery({ queryKey: ["ri", "ageing"], queryFn: () => api.get<{ ageing: Ageing[] }>("/api/reinsurance/accounting/ageing"), enabled: on });
  const recon = useQuery({ queryKey: ["ri", "recon", currency], queryFn: () => api.get<Recon>(`/api/reinsurance/accounting/reconciliation?currency=${currency}`), enabled: on });
  const pending = useQuery({ queryKey: ["ri", "pending"], queryFn: () => api.get<Pending>("/api/reinsurance/accounting/approvals"), enabled: on });
  const act = async (done: string, fn: () => Promise<unknown>) => {
    setError(null); setOk(null);
    try { await fn(); setOk(done); } catch (e) { setError(errorText(e)); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  };
  if (!isLoading && !on) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const mine = user?.username;
  const p = pending.data;
  const decide = (url: string, label: string, requestedBy: string) => requestedBy === mine
    ? <span className="muted">Needs another person</span>
    : <>{can("ri.remit.approve") && <><button type="button" className="btn btn-sm" onClick={() => act(`${label} approved.`, () => api.post(url, { approve: true }))}>Approve</button>{" "}
      <button type="button" className="btn-secondary btn btn-sm" onClick={async () => { const note = await promptDialog({ title: "Reject", message: "Reason (optional)", multiline: true }); if (note === null) return; void act(`${label} rejected.`, () => api.post(url, { approve: false, note: note || undefined })); }}>Reject</button></>}</>;
  const waiting = p ? p.remittances.length + p.brokerageTransfers.length + p.setoffs.length + p.manualJournals.length + p.mappings.length : 0;

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Accounts</h1></div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to="/reinsurance/billings">Billings</Link>
          <Link className="btn-secondary btn" to="/reinsurance/treaty-accounts">Treaty accounts</Link>
          <Link className="btn-secondary btn" to="/reinsurance/bordereaux">Bordereaux</Link>
          <Link className="btn-secondary btn" to="/reinsurance/claims">Claims</Link>
          <Link className="btn-secondary btn" to="/reinsurance/ledger">Ledger</Link>
        </div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {ok && <div className="flash flash-success">{ok}</div>}

      <div className="card"><h2>Alerts</h2>
        {!alerts.data?.alerts.length ? <p>Nothing overdue and no warranty breaches.</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Alert</th><th>Billing</th><th className="ri-num">Amount</th><th /></tr></thead>
            <tbody>{alerts.data.alerts.map((a, i) => (
              <tr key={i}><td><span className={`badge ${a.severity === "high" ? "badge-declined" : "badge-warning"}`}>{a.kind}</span><div className="ri-note">{a.message}</div></td>
                <td><Link to={`/reinsurance/billings/${a.billing_id}`}>{a.billing_ref}</Link></td><td className="ri-num">{minorText(a.amount_minor, a.currency)}</td>
                <td><Link className="btn-secondary btn btn-sm" to={`/reinsurance/placements/${a.placement_id}`}>Placement</Link></td></tr>))}</tbody></table></div>
        )}
        <p className="ri-note">Warranty alerts use each treaty's own premium-payment-warranty days. The time allowed to remit collected premium is a placeholder in Administration; no alert is raised for it until you set it.</p>
      </div>

      <div className="card"><h2>Waiting for approval {waiting > 0 && <span className="badge badge-warning">{waiting}</span>}</h2>
        {!waiting && <p>Nothing is waiting.</p>}
        {p && p.remittances.length > 0 && <><h3>Remittances</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Ref</th><th>Billing</th><th>Pay to</th><th className="ri-num">Amount</th><th>Date</th><th>By</th><th /></tr></thead>
          <tbody>{p.remittances.map((r) => <tr key={r.id}><td>{r.remit_ref}</td><td><Link to={`/reinsurance/billings/${r.billing_id}`}>{r.billing_ref}</Link></td><td>{r.payee_name}</td><td className="ri-num">{minorText(r.amount_minor, r.currency)}</td><td>{r.paid_date}</td><td>{r.requested_by}</td>
            <td>{decide(`/api/reinsurance/remittances/${r.id}/decision`, "Remittance", r.requested_by)}</td></tr>)}</tbody></table></div></>}
        {p && p.brokerageTransfers.length > 0 && <><h3>Brokerage transfers to the house account</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th className="ri-num">Amount</th><th>By</th><th /></tr></thead>
          <tbody>{p.brokerageTransfers.map((t) => <tr key={t.id}><td>{t.transfer_date}</td><td className="ri-num">{minorText(t.amount_minor, t.currency)}</td><td>{t.requested_by}</td><td>{decide(`/api/reinsurance/brokerage-transfers/${t.id}/decision`, "Transfer", t.requested_by)}</td></tr>)}</tbody></table></div></>}
        {p && p.setoffs.length > 0 && <><h3>Set-offs</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th className="ri-num">Amount</th><th>By</th><th /></tr></thead>
          <tbody>{p.setoffs.map((t) => <tr key={t.id}><td>{t.set_date}</td><td className="ri-num">{minorText(t.amount_minor, t.currency)}</td><td>{t.requested_by}</td><td>{decide(`/api/reinsurance/setoffs/${t.id}/decision`, "Set-off", t.requested_by)}</td></tr>)}</tbody></table></div></>}
        {p && p.manualJournals.length > 0 && <><h3>Manual journals</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Lines</th><th>By</th><th /></tr></thead>
          <tbody>{p.manualJournals.map((m) => <tr key={m.id}><td>{m.entry_date}</td><td>{m.description}</td><td>{m.lines.map((l, i) => <div key={i} className="ri-note">{l.role.replace(/_/g, " ").toLowerCase()}: {l.debit_minor ? `Dr ${minorText(l.debit_minor, m.currency)}` : `Cr ${minorText(l.credit_minor, m.currency)}`}</div>)}</td><td>{m.requested_by}</td>
            <td>{decide(`/api/reinsurance/ledger/manual-journals/${m.id}/decision`, "Journal", m.requested_by)}</td></tr>)}</tbody></table></div></>}
        {p && p.mappings.length > 0 && <><h3>Ledger mapping changes</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Role</th><th>New account</th><th>From</th><th>By</th><th /></tr></thead>
          <tbody>{p.mappings.map((m) => <tr key={m.id}><td>{m.role.replace(/_/g, " ").toLowerCase()}</td><td>{m.account_code}</td><td>{m.effective_from}</td><td>{m.proposed_by}</td>
            <td>{m.proposed_by === mine ? <span className="muted">Needs another person</span> : can("ri.rules.approve") && <><button type="button" className="btn btn-sm" onClick={() => act("Mapping approved.", () => api.post(`/api/reinsurance/ledger/mappings/${m.id}/decision`, { approve: true }))}>Approve</button>{" "}
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Mapping rejected.", () => api.post(`/api/reinsurance/ledger/mappings/${m.id}/decision`, { approve: false }))}>Reject</button></>}</td></tr>)}</tbody></table></div></>}
      </div>

      <div className="card"><h2>Ageing of what is owed</h2>
        {!ageing.data?.ageing.length ? <p>Nothing is outstanding.</p> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Owed</th>{ageing.data.ageing[0].buckets.map((b) => <th key={b.label} className="ri-num">{b.label}</th>)}<th className="ri-num">Total</th></tr></thead>
            <tbody>{ageing.data.ageing.map((a) => <tr key={`${a.currency}${a.kind}`}><td>{a.kind === "Premium" ? "Premium from cedants" : "Claims from reinsurers"} ({a.currency})</td>
              {a.buckets.map((b) => <td key={b.label} className="ri-num">{b.minor ? <>{minorText(b.minor, a.currency)}<div className="ri-note">{b.count} bill(s)</div></> : "—"}</td>)}<td className="ri-num"><strong>{minorText(a.total_minor, a.currency)}</strong></td></tr>)}</tbody></table></div>
        )}
      </div>

      <div className="card"><h2>Does the ledger agree?</h2>
        <div className="ri-inline"><div className="field"><label htmlFor="rc">Currency</label><select id="rc" value={currency} onChange={(e) => setCurrency(e.target.value)}>{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select></div>
          {recon.data && <StatusBadge status={recon.data.ok ? "Reconciled" : "Variance"} />}</div>
        {recon.data && (
          <>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Check</th><th className="ri-num">Ledger</th><th className="ri-num">Sub-ledger</th><th className="ri-num">Difference</th></tr></thead>
              <tbody>{recon.data.checks.map((c) => <tr key={c.name} style={c.ok ? undefined : { fontWeight: 700 }}><td>{c.name}</td><td className="ri-num">{minorText(c.ledger_minor, currency)}</td><td className="ri-num">{minorText(c.subledger_minor, currency)}</td><td className="ri-num">{c.ok ? "—" : minorText(c.difference_minor, currency)}</td></tr>)}
                {recon.data.bank && <tr style={recon.data.bank.ok ? undefined : { fontWeight: 700 }}><td>Client-money bank statement of {recon.data.bank.statement_date} against the ledger</td><td className="ri-num">{minorText(recon.data.bank.ledger_minor, currency)}</td><td className="ri-num">{minorText(recon.data.bank.statement_minor, currency)}</td><td className="ri-num">{recon.data.bank.ok ? "—" : minorText(recon.data.bank.difference_minor, currency)}</td></tr>}</tbody></table></div>
            {!recon.data.bank && <p className="ri-note">No bank statement balance has been entered. Add one under Ledger, Bank, to compare the client-money account with the bank.</p>}
            <p>Brokerage earned in cash and not yet moved to the house account: <strong>{minorText(recon.data.brokerage.available_minor, currency)}</strong>.</p>
            {can("ri.remit.create") && recon.data.brokerage.available_minor > 0 && (
              <form onSubmit={(e) => { e.preventDefault(); act("Transfer requested. A second person must approve it.", () => api.post("/api/reinsurance/brokerage-transfers", { ...tx, currency, transfer_date: tx.transfer_date || undefined }).then(() => setTx({ amount: "", transfer_date: "", bank_ref: "" }))); }}>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="bt-a">Move to the house account ({currency})</label><input id="bt-a" inputMode="decimal" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} /></div>
                  <div className="field"><label htmlFor="bt-d">Date</label><input id="bt-d" type="date" value={tx.transfer_date} onChange={(e) => setTx({ ...tx, transfer_date: e.target.value })} /></div>
                  <div className="field"><label htmlFor="bt-r">Bank reference</label><input id="bt-r" value={tx.bank_ref} onChange={(e) => setTx({ ...tx, bank_ref: e.target.value })} /></div>
                  <button className="btn btn-sm" type="submit" disabled={!tx.amount}>Request transfer</button>
                </div>
              </form>
            )}
            {recon.data.unremitted.length > 0 && <p>Collected and not yet paid out: {recon.data.unremitted.map((u) => <span key={u.billing_id}><Link to={`/reinsurance/billings/${u.billing_id}`}>{u.billing_ref}</Link> ({minorText(u.allowable_minor, currency)}) </span>)}</p>}
          </>
        )}
      </div>
    </div>
  );
}

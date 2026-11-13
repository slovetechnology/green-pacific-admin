import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { bpsText, errorText, minorDecimal, minorText, useReinsuranceStatus, type PlacementView } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface BillingRow { id: number; billing_ref: string; kind: "Premium" | "Claim"; placement_id: number; placement_ref: string; cedant_name: string; currency: string; description: string; billed_date: string; due_date: string; due_minor: number; received_minor: number; status: string }
interface Share { id: number; reinsurer_party_id: number; name: string; line_bps: number; payable_minor: number; entitled_minor?: number; paid_minor?: number; pending_minor?: number; allowable_minor?: number; received_minor?: number; setoff_minor?: number; collected_minor?: number; outstanding_minor: number; pending_setoff_minor?: number }
interface BillingView {
  billing: BillingRow & { gross_minor: number; commission_minor: number; brokerage_minor: number; payable_minor: number; brokerage_basis: string | null; brokerage_deducted_from: string | null; claim_ref: string | null; cancel_reason: string | null };
  shares: Share[]; received_minor: number; outstanding_minor: number; remitted_minor: number; pending_minor: number; allowable_minor: number; collected_minor?: number;
  placement: { placement_ref: string }; cedant: { name: string }; treaty: { id: number; treaty_ref: string } | null; journal: { id: number; journal_no: string } | null;
  receipts: { id: number; receipt_ref: string; payer_name: string; received_date: string; amount_minor: number; status: string; bank_ref: string | null; brokerage_recognised_minor: number }[];
  remittances: { id: number; remit_ref: string; payee_name: string; amount_minor: number; paid_date: string; status: string; requested_by: string; bank_ref: string | null }[];
  setoffs: { id: number; amount_minor: number; set_date: string; status: string; requested_by: string }[];
}

export function BillingsListPage() {
  const [params, setParams] = useSearchParams();
  const { can, isLoading } = useReinsuranceStatus();
  const page = Number(params.get("page") || "1");
  const q = new URLSearchParams();
  for (const k of ["kind", "status", "q"]) if (params.get(k)) q.set(k, params.get(k)!);
  q.set("limit", "25"); q.set("offset", String((page - 1) * 25));
  const list = useQuery({ queryKey: ["ri", "billings", q.toString()], queryFn: () => api.get<{ rows: BillingRow[]; total: number }>(`/api/reinsurance/billings?${q.toString()}`), enabled: can("ri.view") });
  const update = (next: Record<string, string>) => {
    const merged: Record<string, string> = {};
    for (const k of ["kind", "status", "q"]) if (params.get(k)) merged[k] = params.get(k)!;
    Object.assign(merged, { page: "1" }, next);
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
    setParams(merged);
  };
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const columns: DataGridColumn<BillingRow>[] = [
    { key: "ref", header: "Billing", render: (b) => (<><Link to={`/reinsurance/billings/${b.id}`}>{b.billing_ref}</Link><div className="ri-note">{b.description}</div></>) },
    { key: "kind", header: "Type", render: (b) => (b.kind === "Premium" ? "Premium" : "Claim") },
    { key: "pl", header: "Placement", render: (b) => (<><Link to={`/reinsurance/placements/${b.placement_id}`}>{b.placement_ref}</Link><div className="ri-note">{b.cedant_name}</div></>) },
    { key: "due", header: "Due", render: (b) => b.due_date },
    { key: "amt", header: "Amount due", align: "right", render: (b) => minorText(b.due_minor, b.currency) },
    { key: "rec", header: "Collected", align: "right", render: (b) => minorText(b.received_minor, b.currency) },
    { key: "st", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
  ];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Billings</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/reinsurance/accounts">Accounts</Link></div></div>
      <div className="toolbar">
        <input type="search" placeholder="Search reference, placement, cedant" defaultValue={params.get("q") || ""} onKeyDown={(e) => { if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value }); }} />
        <select aria-label="Type" value={params.get("kind") || ""} onChange={(e) => update({ kind: e.target.value })}><option value="">Premium and claims</option><option value="Premium">Premium</option><option value="Claim">Claims</option></select>
        <select aria-label="Status" value={params.get("status") || ""} onChange={(e) => update({ status: e.target.value })}><option value="">All statuses</option>{["Open", "Part paid", "Paid", "Cancelled"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <DataGrid columns={columns} rows={list.data?.rows} isLoading={list.isLoading || isLoading} getRowKey={(b) => b.id} emptyMessage="No billings yet. Bill a signed placement from its Billing tab."
        paging={list.data ? { page, totalPages: Math.max(1, Math.ceil(list.data.total / 25)), total: list.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined} />
    </div>
  );
}

export function BillingDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [rcpt, setRcpt] = useState({ share_id: "", amount: "", received_date: "", method: "Bank transfer", bank_ref: "" });
  const [rem, setRem] = useState({ share_id: "", amount: "", paid_date: "", bank_ref: "" });
  const q = useQuery({ queryKey: ["ri", "billing", id], queryFn: () => api.get<BillingView>(`/api/reinsurance/billings/${id}`) });
  const v = q.data;
  const claims = useQuery({
    queryKey: ["ri", "setoff-claims", v?.billing.placement_id],
    queryFn: async () => {
      const list = await api.get<{ rows: BillingRow[] }>(`/api/reinsurance/billings?kind=Claim&placement_id=${v!.billing.placement_id}&limit=50`);
      return (await Promise.all(list.rows.filter((r) => r.status !== "Cancelled").map((r) => api.get<BillingView>(`/api/reinsurance/billings/${r.id}`)))).filter((c) => c.outstanding_minor > 0);
    },
    enabled: Boolean(v && v.billing.kind === "Premium"),
  });
  const [so, setSo] = useState({ payable_share_id: "", receivable_share_id: "", amount: "" });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (q.isLoading) return <p>Loading…</p>;
  if (q.error || !v) return <div className="flash flash-error">{errorText(q.error) || "Billing not found."}</div>;
  const b = v.billing;
  const cur = b.currency;
  const premium = b.kind === "Premium";
  const base = `/api/reinsurance/billings/${b.id}`;
  const cancelled = b.status === "Cancelled";
  return (
    <div>
      <div className="page-header"><div>
        <p className="eyebrow"><Link to="/reinsurance/billings">Billings</Link> · {premium ? "Premium" : "Claim"} · {v.cedant.name}</p>
        <h1>{b.billing_ref} <StatusBadge status={b.status} /></h1>
        <p className="ri-note">{b.description} · <Link to={`/reinsurance/placements/${b.placement_id}`}>{v.placement.placement_ref}</Link>{v.treaty && <> · <Link to={`/reinsurance/treaties/${v.treaty.id}`}>{v.treaty.treaty_ref}</Link></>} · billed {b.billed_date}, due {b.due_date}{v.journal && ` · journal ${v.journal.journal_no}`}</p></div>
        <div className="page-header-actions">{can("ri.accounts.post") && !cancelled && <button type="button" className="btn-secondary btn" onClick={() => { const reason = window.prompt("Why is this billing being cancelled?"); if (reason) run("Billing cancelled.", () => api.post(`${base}/cancel`, { reason })); }}>Cancel billing</button>}</div></div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      {cancelled && <div className="flash flash-info">Cancelled: {b.cancel_reason}. Its ledger entry was reversed.</div>}

      <div className="card"><h2>Position</h2>
        <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {([
            premium ? ["Gross premium", minorText(b.gross_minor, cur)] : ["Claim", b.claim_ref || ""],
            premium ? ["Ceding commission", minorText(b.commission_minor, cur)] : ["Due from reinsurers", minorText(b.due_minor, cur)],
            premium ? ["Brokerage", `${minorText(b.brokerage_minor, cur)} (${b.brokerage_deducted_from === "Cedant" ? "paid by the cedant" : "from the reinsurers"}, ${b.brokerage_basis})`] : ["Collected", minorText(v.collected_minor ?? 0, cur)],
            premium ? ["Due from the cedant", minorText(b.due_minor, cur)] : ["Paid on to the cedant", minorText(v.remitted_minor, cur)],
            premium ? ["Payable to reinsurers", minorText(b.payable_minor, cur)] : ["Free to pay on", minorText(v.allowable_minor, cur)],
            premium ? ["Received", minorText(v.received_minor, cur)] : ["Outstanding from reinsurers", minorText(v.outstanding_minor, cur)],
            ...(premium ? [["Outstanding", minorText(v.outstanding_minor, cur)], ["Paid out so far", minorText(v.remitted_minor, cur)]] as [string, string][] : []),
          ] as [string, string][]).map(([k, val]) => <div key={k}><div className="k">{k}</div><div className="v">{val}</div></div>)}
        </div>
        <p className="ri-note">{premium ? "A reinsurer can be paid its share of what has been collected, rounded down, so a part payment releases a part and the final payment releases the rest. Nothing is paid out before it is received." : "Claim money is paid to the cedant only as it is collected from the reinsurers, or set off against premium owed to them."}</p>
      </div>

      <div className="card"><h2>{premium ? "Reinsurers" : "Reinsurers' shares"}</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinsurer</th><th className="ri-num">Share</th><th className="ri-num">{premium ? "Payable" : "Owes"}</th>
          {premium ? <><th className="ri-num">Collected entitlement</th><th className="ri-num">Paid</th><th className="ri-num">Free to pay</th></> : <><th className="ri-num">Received</th><th className="ri-num">Set off</th><th className="ri-num">Outstanding</th></>}</tr></thead>
          <tbody>{v.shares.map((s) => <tr key={s.id}><td>{s.name}</td><td className="ri-num">{bpsText(s.line_bps)}</td><td className="ri-num">{minorText(s.payable_minor, cur)}</td>
            {premium ? <><td className="ri-num">{minorText(s.entitled_minor ?? 0, cur)}</td><td className="ri-num">{minorText(s.paid_minor ?? 0, cur)}{s.pending_minor ? <div className="ri-note">+ {minorText(s.pending_minor, cur)} waiting</div> : null}</td><td className="ri-num"><strong>{minorText(s.allowable_minor ?? 0, cur)}</strong></td></>
              : <><td className="ri-num">{minorText(s.received_minor ?? 0, cur)}</td><td className="ri-num">{minorText(s.setoff_minor ?? 0, cur)}</td><td className="ri-num"><strong>{minorText(s.outstanding_minor, cur)}</strong></td></>}</tr>)}</tbody></table></div>
      </div>

      <div className="card"><h2>Receipts</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Ref</th><th>From</th><th>Date</th><th className="ri-num">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{!v.receipts.length && <tr><td colSpan={6}>Nothing received yet.</td></tr>}
            {v.receipts.map((r) => <tr key={r.id}><td>{r.receipt_ref}<div className="ri-note">{r.bank_ref || ""}</div></td><td>{r.payer_name}</td><td>{r.received_date}</td><td className="ri-num">{minorText(r.amount_minor, cur)}{r.brokerage_recognised_minor > 0 && <div className="ri-note">earned {minorText(r.brokerage_recognised_minor, cur)} brokerage</div>}</td><td><StatusBadge status={r.status} /></td>
              <td>{can("ri.accounts.post") && r.status === "Posted" && <button type="button" className="btn-secondary btn btn-sm" onClick={() => { const reason = window.prompt("Why is this receipt being reversed?"); if (reason) run("Receipt reversed.", () => api.post(`/api/reinsurance/receipts/${r.id}/reverse`, { reason })); }}>Reverse</button>}</td></tr>)}</tbody></table></div>
        {can("ri.accounts.post") && !cancelled && b.status !== "Paid" && (
          <form onSubmit={(e) => { e.preventDefault(); run("Receipt recorded.", () => api.post(`${base}/receipts`, { ...rcpt, share_id: rcpt.share_id ? Number(rcpt.share_id) : undefined, received_date: rcpt.received_date || undefined }).then(() => setRcpt({ ...rcpt, amount: "", bank_ref: "" }))); }}>
            <div className="ri-inline">
              {!premium && <div className="field"><label htmlFor="r-share">Paid by</label><select id="r-share" value={rcpt.share_id} onChange={(e) => setRcpt({ ...rcpt, share_id: e.target.value })}><option value="">Choose…</option>{v.shares.filter((s) => s.outstanding_minor > 0).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
              <div className="field"><label htmlFor="r-amt">Amount ({cur})</label><input id="r-amt" inputMode="decimal" value={rcpt.amount} onChange={(e) => setRcpt({ ...rcpt, amount: e.target.value })} placeholder={minorDecimal(premium ? v.outstanding_minor : undefined)} /></div>
              <div className="field"><label htmlFor="r-date">Date</label><input id="r-date" type="date" value={rcpt.received_date} onChange={(e) => setRcpt({ ...rcpt, received_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="r-ref">Bank reference</label><input id="r-ref" value={rcpt.bank_ref} onChange={(e) => setRcpt({ ...rcpt, bank_ref: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!rcpt.amount}>Record receipt</button>
            </div>
          </form>
        )}
      </div>

      <div className="card"><h2>Payments out</h2>
        <p className="ri-note">A payment is requested by one person and approved by another, and the client-money account must hold the cash.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Ref</th><th>To</th><th>Date</th><th className="ri-num">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{!v.remittances.length && <tr><td colSpan={6}>None yet.</td></tr>}
            {v.remittances.map((r) => <tr key={r.id}><td>{r.remit_ref}<div className="ri-note">requested by {r.requested_by}</div></td><td>{r.payee_name}</td><td>{r.paid_date}</td><td className="ri-num">{minorText(r.amount_minor, cur)}</td><td><StatusBadge status={r.status} /></td>
              <td>{r.status === "Pending" && can("ri.remit.create") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Withdrawn.", () => api.post(`/api/reinsurance/remittances/${r.id}/withdraw`))}>Withdraw</button>}</td></tr>)}</tbody></table></div>
        {can("ri.remit.create") && !cancelled && (
          <form onSubmit={(e) => { e.preventDefault(); run("Payment requested. A second person must approve it.", () => api.post(`${base}/remittances`, { ...rem, share_id: rem.share_id ? Number(rem.share_id) : undefined, paid_date: rem.paid_date || undefined }).then(() => setRem({ ...rem, amount: "", bank_ref: "" }))); }}>
            <div className="ri-inline">
              {premium && <div className="field"><label htmlFor="x-share">Pay to</label><select id="x-share" value={rem.share_id} onChange={(e) => setRem({ ...rem, share_id: e.target.value })}><option value="">Choose…</option>{v.shares.map((s) => <option key={s.id} value={s.id}>{s.name} (free {minorText(s.allowable_minor ?? 0, cur)})</option>)}</select></div>}
              <div className="field"><label htmlFor="x-amt">Amount ({cur})</label><input id="x-amt" inputMode="decimal" value={rem.amount} onChange={(e) => setRem({ ...rem, amount: e.target.value })} /></div>
              <div className="field"><label htmlFor="x-date">Payment date</label><input id="x-date" type="date" value={rem.paid_date} onChange={(e) => setRem({ ...rem, paid_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="x-ref">Bank reference</label><input id="x-ref" value={rem.bank_ref} onChange={(e) => setRem({ ...rem, bank_ref: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!rem.amount}>Request payment</button>
            </div>
          </form>
        )}
      </div>

      {premium && can("ri.remit.create") && !cancelled && (claims.data?.length ?? 0) > 0 && (
        <div className="card"><h2>Set off a claim</h2>
          <p className="ri-note">Pays a reinsurer's share of a claim against premium we owe it. No cash moves. It is limited to the premium collected and the claim outstanding, and a second person approves it.</p>
          <form onSubmit={(e) => { e.preventDefault(); run("Set-off requested.", () => api.post("/api/reinsurance/setoffs", { payable_share_id: Number(so.payable_share_id), receivable_share_id: Number(so.receivable_share_id), amount: so.amount })); }}>
            <div className="ri-inline">
              <div className="field"><label htmlFor="so-pay">Premium owed to</label><select id="so-pay" value={so.payable_share_id} onChange={(e) => setSo({ ...so, payable_share_id: e.target.value, receivable_share_id: "" })}><option value="">Choose…</option>{v.shares.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="field"><label htmlFor="so-rec">Against claim</label><select id="so-rec" value={so.receivable_share_id} onChange={(e) => setSo({ ...so, receivable_share_id: e.target.value })}><option value="">Choose…</option>
                {claims.data!.flatMap((c) => c.shares.filter((s) => s.reinsurer_party_id === v.shares.find((x) => String(x.id) === so.payable_share_id)?.reinsurer_party_id && s.outstanding_minor > 0).map((s) => <option key={s.id} value={s.id}>{c.billing.claim_ref} ({minorText(s.outstanding_minor, cur)} outstanding)</option>))}</select></div>
              <div className="field"><label htmlFor="so-amt">Amount</label><input id="so-amt" inputMode="decimal" value={so.amount} onChange={(e) => setSo({ ...so, amount: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!so.payable_share_id || !so.receivable_share_id || !so.amount}>Request set-off</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// The Billing tab of a placement: what has been billed, and a form to bill premium or a claim.
export function PlacementBillingTab({ v }: { v: PlacementView }) {
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const pid = v.placement.id;
  const layered = v.layers.length > 1;
  const [layer, setLayer] = useState(layered ? "" : v.layers[0] ? String(v.layers[0].id) : "");
  const [f, setF] = useState({ gross: "", due_date: "", billed_date: "", instalment_label: "", commission: "", brokerage: "", claim_ref: "", amount: "" });
  const [mode, setMode] = useState<"Premium" | "Claim">("Premium");
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const list = useQuery({ queryKey: ["ri", "billings", "placement", pid], queryFn: () => api.get<{ rows: BillingRow[] }>(`/api/reinsurance/billings?placement_id=${pid}&limit=100`) });
  const sug = useQuery({
    queryKey: ["ri", "suggestion", pid, layer],
    queryFn: () => api.get<{ suggestion: { gross_minor: number | null; commission_bps: number; brokerage_bps: number; brokerage_deducted_from: string; brokerage_basis: string; payment_warranty_days: number | null; due_in_days: number; due_in_days_is_default: boolean; canBill: boolean } }>(`/api/reinsurance/placements/${pid}/billing-suggestion${layer ? `?layer_id=${layer}` : ""}`),
    enabled: !layered || Boolean(layer),
  });
  const s = sug.data?.suggestion;
  async function bill() {
    setFlash(null);
    const common = { layer_id: layer ? Number(layer) : undefined, billed_date: f.billed_date || undefined, due_date: f.due_date };
    try {
      const body = mode === "Premium"
        ? { ...common, gross: f.gross || undefined, instalment_label: f.instalment_label || undefined, commission_bps: f.commission ? Math.round(Number(f.commission) * 100) : undefined, brokerage_bps: f.brokerage ? Math.round(Number(f.brokerage) * 100) : undefined }
        : { ...common, claim_ref: f.claim_ref, amount: f.amount };
      await api.post(`/api/reinsurance/placements/${pid}/billings/${mode === "Premium" ? "premium" : "claim"}`, body);
      setFlash({ kind: "success", text: `${mode} billed.` });
      setF({ ...f, gross: "", amount: "", claim_ref: "" });
    } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  const cur = v.placement.currency;
  const settleable = ["Slip Signed", "Documented", "Invoiced", "Collecting", "Settled"].includes(v.placement.status);
  return (
    <div>
      <div className="card"><h2>Billings</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Billing</th><th>Type</th><th>Due</th><th className="ri-num">Amount due</th><th className="ri-num">Collected</th><th>Status</th></tr></thead>
          <tbody>{!list.data?.rows.length && <tr><td colSpan={6}>{settleable ? "Nothing billed yet." : "Premium is billed once the lines are signed."}</td></tr>}
            {(list.data?.rows ?? []).map((b) => <tr key={b.id}><td><Link to={`/reinsurance/billings/${b.id}`}>{b.billing_ref}</Link><div className="ri-note">{b.description}</div></td><td>{b.kind}</td><td>{b.due_date}</td><td className="ri-num">{minorText(b.due_minor, cur)}</td><td className="ri-num">{minorText(b.received_minor, cur)}</td><td><StatusBadge status={b.status} /></td></tr>)}</tbody></table></div>
      </div>
      {can("ri.accounts.post") && settleable && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); bill(); }}>
          <h2>New billing</h2>
          {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
          <div className="ri-inline">
            <div className="field"><label htmlFor="b-mode">Bill</label><select id="b-mode" value={mode} onChange={(e) => setMode(e.target.value as "Premium" | "Claim")}><option>Premium</option><option>Claim</option></select></div>
            {layered && <div className="field"><label htmlFor="b-layer">Layer</label><select id="b-layer" value={layer} onChange={(e) => setLayer(e.target.value)}><option value="">Choose…</option>{v.layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}</option>)}</select></div>}
          </div>
          {mode === "Premium" ? (
            <>
              <div className="form-grid">
                <div className="field"><label htmlFor="b-gross">Gross premium for the order ({cur})</label><input id="b-gross" inputMode="decimal" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} placeholder={s?.gross_minor ? minorDecimal(s.gross_minor) : ""} />
                  <small className="muted">Blank bills the quoted premium{s?.gross_minor ? ` (${minorText(s.gross_minor, cur)})` : ""}. Enter an amount for an instalment.</small></div>
                <div className="field"><label htmlFor="b-inst">Instalment label</label><input id="b-inst" value={f.instalment_label} onChange={(e) => setF({ ...f, instalment_label: e.target.value })} placeholder="Deposit, Q2, adjustment…" /></div>
                <div className="field"><label htmlFor="b-bd">Billed on</label><input id="b-bd" type="date" value={f.billed_date} onChange={(e) => setF({ ...f, billed_date: e.target.value })} /></div>
                <div className="field"><label htmlFor="b-dd">Due on</label><input id="b-dd" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
                  {s && <small className="muted">{s.payment_warranty_days ? `The treaty's premium payment warranty is ${s.payment_warranty_days} days.` : "No payment warranty on the treaty; 30 days is only a suggestion."}</small>}</div>
                <div className="field"><label htmlFor="b-com">Ceding commission (%)</label><input id="b-com" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} placeholder={s ? (s.commission_bps / 100).toFixed(2) : ""} /></div>
                <div className="field"><label htmlFor="b-brk">Brokerage (%)</label><input id="b-brk" value={f.brokerage} onChange={(e) => setF({ ...f, brokerage: e.target.value })} placeholder={s ? (s.brokerage_bps / 100).toFixed(2) : ""} /></div>
              </div>
              {s && <p className="ri-note">Brokerage is {s.brokerage_deducted_from === "Cedant" ? "paid by the cedant on top" : "deducted from the reinsurers' share"} and recognised {s.brokerage_basis.toLowerCase()}.</p>}
            </>
          ) : (
            <div className="form-grid">
              <div className="field"><label htmlFor="b-cref">Claim reference</label><input id="b-cref" value={f.claim_ref} onChange={(e) => setF({ ...f, claim_ref: e.target.value })} /></div>
              <div className="field"><label htmlFor="b-camt">Amount recoverable from the reinsurers ({cur})</label><input id="b-camt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <div className="field"><label htmlFor="b-cbd">Billed on</label><input id="b-cbd" type="date" value={f.billed_date} onChange={(e) => setF({ ...f, billed_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="b-cdd">Due on</label><input id="b-cdd" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
            </div>
          )}
          <button className="btn btn-sm" type="submit" disabled={!f.due_date || (layered && !layer)}>Bill</button>
        </form>
      )}
    </div>
  );
}

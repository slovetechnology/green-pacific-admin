import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { bpsText, errorText, minorDecimal, minorText, useReinsuranceStatus, type PlacementView } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface Figures { paid_minor: number; outstanding_minor: number; incurred_minor: number; called_minor: number; callable_minor: number; reinstated_minor: number }
interface ClaimRow extends Figures {
  id: number; claim_ref: string; cedant_claim_ref: string | null; insured: string | null; loss_date: string; notified_date: string; status: string; currency: string;
  placement_id: number; placement_ref: string; treaty_id: number | null; treaty_ref: string | null; treaty_name: string | null; cedant_name: string; layer_id: number | null;
}
interface Tranche { reinstatement_no: number; amount_minor: number; premium_bps: number; basis: string; premium_minor: number }
interface ReinstatementCalc {
  currency: string; limit_minor: number; premium_basis_minor: number; premium_basis_source: string; prior_reinstated_minor: number; loss_date: string;
  amount_minor: number; premium_minor: number; tranches: Tranche[]; unreinstated_minor: number; capacity_minor: number; reinstated_after_minor: number; room_after_minor: number;
  time_factor: { remaining_days: number; period_days: number } | null; unreinstated_paid_minor?: number;
}
interface Position { limit_minor: number | null; reinstatement_count: number; aggregate_capacity_minor: number | null; paid_minor: number; outstanding_minor: number; reinstated_minor: number; remaining_minor: number | null; remaining_after_reserves_minor: number | null; xol: boolean; currency: string }
interface ClaimView {
  claim: ClaimRow & { description: string | null; cause: string | null; event_ref: string | null; status_reason: string | null; created_by: string; cedant: { id: number; name: string } };
  placement: { placement_ref: string; order_bps: number };
  treaty: { id: number; treaty_ref: string; name: string; treaty_type: string } | null;
  layer: { id: number; layer_no: number; description: string | null; limit_minor: number | null } | null;
  figures: Figures;
  movements: { id: number; kind: "Reserve" | "Paid"; amount_minor: number; movement_date: string; note: string | null; created_by: string }[];
  cashCalls: { id: number; call_ref: string; amount_minor: number; order_amount_minor: number; urgent: number; requested_date: string; due_date: string; status: string; billing_id: number; billing_ref: string; billing_status: string; collected_minor: number; note: string | null }[];
  reinstatements: { id: number; amount_minor: number; premium_minor: number; status: string; billing_id: number | null; loss_date: string }[];
  position: Position | null;
  warnings: string[];
}

export function RiClaimsListPage() {
  const [params, setParams] = useSearchParams();
  const { can, isLoading } = useReinsuranceStatus();
  const page = Number(params.get("page") || "1");
  const q = new URLSearchParams();
  for (const k of ["status", "q", "treaty_id"]) if (params.get(k)) q.set(k, params.get(k)!);
  q.set("limit", "25"); q.set("offset", String((page - 1) * 25));
  const list = useQuery({ queryKey: ["ri", "claims", q.toString()], queryFn: () => api.get<{ claims: ClaimRow[]; total: number }>(`/api/reinsurance/claims?${q.toString()}`), enabled: can("ri.view") });
  const update = (next: Record<string, string>) => {
    const merged: Record<string, string> = {};
    for (const k of ["status", "q", "treaty_id"]) if (params.get(k)) merged[k] = params.get(k)!;
    Object.assign(merged, { page: "1" }, next);
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
    setParams(merged);
  };
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const columns: DataGridColumn<ClaimRow>[] = [
    { key: "ref", header: "Claim", render: (c) => (<><Link to={`/reinsurance/claims/${c.id}`}>{c.claim_ref}</Link><div className="ri-note">{c.cedant_claim_ref || ""}{c.insured ? ` · ${c.insured}` : ""}</div></>) },
    { key: "pl", header: "Placement", render: (c) => (<><Link to={`/reinsurance/placements/${c.placement_id}`}>{c.placement_ref}</Link><div className="ri-note">{c.cedant_name}</div></>) },
    { key: "loss", header: "Loss date", render: (c) => c.loss_date },
    { key: "paid", header: "Paid", align: "right", render: (c) => minorText(c.paid_minor, c.currency) },
    { key: "os", header: "Outstanding", align: "right", render: (c) => minorText(c.outstanding_minor, c.currency) },
    { key: "call", header: "Called", align: "right", render: (c) => minorText(c.called_minor, c.currency) },
    { key: "st", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
  ];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Claims</h1></div>
        <div className="page-header-actions">{can("ri.claims.handle") && <Link className="btn" to="/reinsurance/claims/new">Record a claim</Link>}</div></div>
      <div className="toolbar">
        <input type="search" placeholder="Search claim, cedant reference, insured, event" defaultValue={params.get("q") || ""} onKeyDown={(e) => { if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value }); }} />
        <select aria-label="Status" value={params.get("status") || ""} onChange={(e) => update({ status: e.target.value })}><option value="">All statuses</option>{["Notified", "Open", "Closed", "Declined"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <DataGrid columns={columns} rows={list.data?.claims} isLoading={list.isLoading || isLoading} getRowKey={(c) => c.id} emptyMessage="No claims yet. Record one against a signed placement."
        paging={list.data ? { page, totalPages: Math.max(1, Math.ceil(list.data.total / 25)), total: list.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined} />
    </div>
  );
}

const SIGNED = ["Slip Signed", "Documented", "Invoiced", "Collecting", "Settled"];

export function RiClaimNewPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { can, isLoading } = useReinsuranceStatus();
  const [placementId, setPlacementId] = useState(params.get("placement_id") || "");
  const [form, setForm] = useState({ layer_id: "", loss_date: "", notified_date: "", cedant_claim_ref: "", insured: "", event_ref: "", cause: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const placements = useQuery({ queryKey: ["ri", "placements", "signed"], queryFn: () => api.get<{ rows: { id: number; placement_ref: string; status: string; subject_type: string; treaty_ref: string | null; fac_ref: string | null; cedant_name: string }[] }>("/api/reinsurance/placements?limit=200"), enabled: can("ri.view") });
  const view = useQuery({ queryKey: ["ri", "placement", placementId], queryFn: () => api.get<PlacementView>(`/api/reinsurance/placements/${placementId}`), enabled: Boolean(placementId) });
  if (!isLoading && !can("ri.claims.handle")) return <div className="flash flash-error">Recording a claim needs the claims handler role.</div>;
  const layers = view.data?.layers ?? [];
  const choices = (placements.data?.rows ?? []).filter((p) => SIGNED.includes(p.status));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      const out = await api.post<ClaimView>(`/api/reinsurance/placements/${placementId}/claims`, { ...form, layer_id: form.layer_id ? Number(form.layer_id) : undefined, notified_date: form.notified_date || undefined });
      nav(`/reinsurance/claims/${out.claim.id}`);
    } catch (err) { setError(errorText(err)); }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow"><Link to="/reinsurance/claims">Claims</Link></p><h1>Record a claim</h1></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      <form className="card" onSubmit={submit}>
        <div className="field"><label htmlFor="c-pl">Placement (signed lines only)</label>
          <select id="c-pl" value={placementId} onChange={(e) => { setPlacementId(e.target.value); setForm({ ...form, layer_id: "" }); }} required>
            <option value="">Choose…</option>{choices.map((p) => <option key={p.id} value={p.id}>{p.placement_ref} · {p.treaty_ref || p.fac_ref} · {p.cedant_name}</option>)}</select></div>
        {layers.length > 0 && <div className="field"><label htmlFor="c-layer">Layer</label><select id="c-layer" value={form.layer_id} onChange={set("layer_id")} required><option value="">Choose…</option>{layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}{l.description ? ` · ${l.description}` : ""}</option>)}</select></div>}
        <div className="ri-inline">
          <div className="field"><label htmlFor="c-loss">Date of loss</label><input id="c-loss" type="date" value={form.loss_date} onChange={set("loss_date")} required /></div>
          <div className="field"><label htmlFor="c-not">Date notified</label><input id="c-not" type="date" value={form.notified_date} onChange={set("notified_date")} /><span className="ri-note">Leave blank for today</span></div>
          <div className="field"><label htmlFor="c-ref">Cedant's claim reference</label><input id="c-ref" value={form.cedant_claim_ref} onChange={set("cedant_claim_ref")} /></div>
          <div className="field"><label htmlFor="c-ev">Event reference</label><input id="c-ev" value={form.event_ref} onChange={set("event_ref")} /></div>
        </div>
        <div className="ri-inline">
          <div className="field"><label htmlFor="c-ins">Insured</label><input id="c-ins" value={form.insured} onChange={set("insured")} /></div>
          <div className="field"><label htmlFor="c-cause">Cause of loss</label><input id="c-cause" value={form.cause} onChange={set("cause")} /></div>
        </div>
        <div className="field"><label htmlFor="c-desc">Description</label><textarea id="c-desc" rows={3} value={form.description} onChange={set("description")} /></div>
        <button className="btn" type="submit" disabled={!placementId || !form.loss_date}>Record claim</button>
      </form>
    </div>
  );
}

export function RiClaimDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [mv, setMv] = useState({ kind: "Paid", amount: "", movement_date: "", note: "" });
  const [cc, setCc] = useState({ amount: "", requested_date: "", due_date: "", urgent: false, note: "" });
  const [basis, setBasis] = useState("");
  const [preview, setPreview] = useState<ReinstatementCalc | null>(null);
  const q = useQuery({ queryKey: ["ri", "claim", id], queryFn: () => api.get<ClaimView>(`/api/reinsurance/claims/${id}`) });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (q.isLoading) return <p>Loading…</p>;
  const v = q.data;
  if (q.error || !v) return <div className="flash flash-error">{errorText(q.error) || "Claim not found."}</div>;
  const c = v.claim, f = v.figures, cur = c.currency, base = `/api/reinsurance/claims/${c.id}`;
  const live = c.status === "Notified" || c.status === "Open";
  const handle = can("ri.claims.handle");
  const xol = v.position?.xol && (v.position.reinstatement_count > 0);
  const order = v.placement.order_bps;
  return (
    <div>
      <div className="page-header"><div>
        <p className="eyebrow"><Link to="/reinsurance/claims">Claims</Link> · {c.cedant.name}</p>
        <h1>{c.claim_ref} <StatusBadge status={c.status} /></h1>
        <p className="ri-note">{c.cedant_claim_ref ? `${c.cedant_claim_ref} · ` : ""}{c.insured ? `${c.insured} · ` : ""}<Link to={`/reinsurance/placements/${c.placement_id}`}>{v.placement.placement_ref}</Link>{v.treaty && <> · <Link to={`/reinsurance/treaties/${v.treaty.id}`}>{v.treaty.treaty_ref}</Link></>}{v.layer && ` · layer ${v.layer.layer_no}`} · loss {c.loss_date}, notified {c.notified_date}</p></div>
        {handle && <div className="page-header-actions">
          {live && <button type="button" className="btn-secondary btn" onClick={() => run("Claim closed.", () => api.post(`${base}/status`, { action: "close" }))}>Close</button>}
          {live && <button type="button" className="btn-secondary btn" onClick={() => { const reason = window.prompt("Why is this claim being declined?"); if (reason) run("Claim declined.", () => api.post(`${base}/status`, { action: "decline", reason })); }}>Decline</button>}
          {!live && <button type="button" className="btn-secondary btn" onClick={() => { const reason = window.prompt("Why is this claim being reopened?"); if (reason) run("Claim reopened.", () => api.post(`${base}/status`, { action: "reopen", reason })); }}>Reopen</button>}
        </div>}</div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      {c.status_reason && <div className="flash flash-info">{c.status}: {c.status_reason}</div>}
      {v.warnings.map((w) => <div key={w} className="flash flash-warning">{w}</div>)}

      <div className="card"><h2>Figures (100% of the {v.layer ? "layer" : "treaty"})</h2>
        <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {([["Paid by the cedant", minorText(f.paid_minor, cur)], ["Outstanding reserve", minorText(f.outstanding_minor, cur)], ["Incurred", minorText(f.incurred_minor, cur)], ["Called from reinsurers", minorText(f.called_minor, cur)],
            ["Paid, not yet called", minorText(f.callable_minor, cur)], ["Reinstated", minorText(f.reinstated_minor, cur)], ["Our order", bpsText(order)], ["Called at our order", minorText(v.cashCalls.filter((k) => k.status === "Issued").reduce((sum, k) => sum + k.order_amount_minor, 0), cur)]] as [string, string][])
            .map(([k, val]) => <div key={k}><div className="k">{k}</div><div className="v">{val}</div></div>)}
        </div>
        <p className="ri-note">Amounts are as the cedant reports them, after retention and cession. A cash call scales them to our order before billing the reinsurers.</p>
        {v.position?.aggregate_capacity_minor != null && <p className="ri-note">Layer capacity including {v.position.reinstatement_count} reinstatement(s): {minorText(v.position.aggregate_capacity_minor, cur)}. Paid on the layer so far {minorText(v.position.paid_minor, cur)}; {minorText(v.position.remaining_minor, cur)} left ({minorText(v.position.remaining_after_reserves_minor, cur)} after outstanding reserves).</p>}
      </div>

      <div className="card"><h2>Reserve and payments</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Movement</th><th className="ri-num">Amount</th><th>Note</th><th>By</th></tr></thead>
          <tbody>{!v.movements.length && <tr><td colSpan={5}>Nothing recorded yet.</td></tr>}
            {v.movements.map((m) => <tr key={m.id}><td>{m.movement_date}</td><td>{m.kind === "Reserve" ? "Outstanding reserve set to" : "Paid"}</td><td className="ri-num">{minorText(m.amount_minor, cur)}</td><td>{m.note}</td><td>{m.created_by}</td></tr>)}</tbody></table></div>
        {handle && live && (
          <form onSubmit={(e) => { e.preventDefault(); run("Recorded.", () => api.post(`${base}/movements`, { ...mv, movement_date: mv.movement_date || undefined }).then(() => setMv({ ...mv, amount: "", note: "" }))); }}>
            <div className="ri-inline">
              <div className="field"><label htmlFor="m-kind">Record</label><select id="m-kind" value={mv.kind} onChange={(e) => setMv({ ...mv, kind: e.target.value })}><option value="Paid">An amount paid by the cedant</option><option value="Reserve">The outstanding reserve (new total)</option></select></div>
              <div className="field"><label htmlFor="m-amt">Amount ({cur})</label><input id="m-amt" inputMode="decimal" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} /></div>
              <div className="field"><label htmlFor="m-date">Date</label><input id="m-date" type="date" value={mv.movement_date} onChange={(e) => setMv({ ...mv, movement_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="m-note">Note</label><input id="m-note" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!mv.amount}>Record</button>
            </div>
            <p className="ri-note">A payment is added to the total paid; a reserve replaces the previous one. Nothing is edited afterwards: a correction is a further entry (a reduction in payments needs a note).</p>
          </form>)}
      </div>

      <div className="card"><h2>Cash calls</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Cash call</th><th>Billing</th><th>Due</th><th className="ri-num">Claim amount</th><th className="ri-num">Billed at our order</th><th className="ri-num">Collected</th><th>Status</th><th /></tr></thead>
          <tbody>{!v.cashCalls.length && <tr><td colSpan={8}>No cash calls yet.</td></tr>}
            {v.cashCalls.map((k) => <tr key={k.id}><td>{k.call_ref}{k.urgent ? <span className="ri-note"> · urgent</span> : null}<div className="ri-note">{k.note}</div></td>
              <td><Link to={`/reinsurance/billings/${k.billing_id}`}>{k.billing_ref}</Link></td><td>{k.due_date}</td><td className="ri-num">{minorText(k.amount_minor, cur)}</td><td className="ri-num">{minorText(k.order_amount_minor, cur)}</td><td className="ri-num">{minorText(k.collected_minor, cur)}</td>
              <td><StatusBadge status={k.status} /></td>
              <td>{handle && k.status === "Issued" && <button type="button" className="btn-secondary btn btn-sm" onClick={() => { const reason = window.prompt("Why is this cash call being cancelled?"); if (reason) run("Cash call cancelled.", () => api.post(`/api/reinsurance/cash-calls/${k.id}/cancel`, { reason })); }}>Cancel</button>}</td></tr>)}</tbody></table></div>
        {handle && live && f.callable_minor > 0 && (
          <form onSubmit={(e) => { e.preventDefault(); run("Cash call issued and billed to the reinsurers.", () => api.post(`${base}/cash-calls`, { ...cc, amount: cc.amount || undefined, requested_date: cc.requested_date || undefined }).then(() => setCc({ amount: "", requested_date: "", due_date: "", urgent: false, note: "" }))); }}>
            <div className="ri-inline">
              <div className="field"><label htmlFor="cc-amt">Amount ({cur})</label><input id="cc-amt" inputMode="decimal" value={cc.amount} onChange={(e) => setCc({ ...cc, amount: e.target.value })} placeholder={minorDecimal(f.callable_minor)} /></div>
              <div className="field"><label htmlFor="cc-req">Requested</label><input id="cc-req" type="date" value={cc.requested_date} onChange={(e) => setCc({ ...cc, requested_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="cc-due">Payable by</label><input id="cc-due" type="date" value={cc.due_date} onChange={(e) => setCc({ ...cc, due_date: e.target.value })} required /></div>
              <div className="field"><label htmlFor="cc-note">Note</label><input id="cc-note" value={cc.note} onChange={(e) => setCc({ ...cc, note: e.target.value })} /></div>
              <label className="ri-check"><input type="checkbox" checked={cc.urgent} onChange={(e) => setCc({ ...cc, urgent: e.target.checked })} /> Urgent</label>
              <button className="btn btn-sm" type="submit" disabled={!cc.due_date}>Issue cash call</button>
            </div>
            <p className="ri-note">Only money the cedant has already paid can be called. The reinsurers are billed their signed shares of it, and what they pay is passed on to the cedant from the billing.</p>
          </form>)}
      </div>

      {xol && (
        <div className="card"><h2>Reinstatement premium</h2>
          {v.reinstatements.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Loss date</th><th className="ri-num">Limit restored</th><th className="ri-num">Premium (100%)</th><th>Status</th><th /></tr></thead>
            <tbody>{v.reinstatements.map((r) => <tr key={r.id}><td>{r.loss_date}</td><td className="ri-num">{minorText(r.amount_minor, cur)}</td><td className="ri-num">{minorText(r.premium_minor, cur)}</td><td><StatusBadge status={r.status} />{r.billing_id && <> <Link to={`/reinsurance/billings/${r.billing_id}`}>billing</Link></>}</td>
              <td>
                {can("ri.accounts.post") && r.status === "Calculated" && r.premium_minor > 0 && <button type="button" className="btn btn-sm" onClick={() => { const due = window.prompt("Payable by (YYYY-MM-DD)?"); if (due) run("Reinstatement premium billed.", () => api.post(`/api/reinsurance/reinstatements/${r.id}/bill`, { due_date: due })); }}>Bill</button>}
                {handle && r.status !== "Cancelled" && <button type="button" className="btn-secondary btn btn-sm" onClick={() => { const reason = window.prompt("Why is this being cancelled?"); if (reason) run("Reinstatement cancelled.", () => api.post(`/api/reinsurance/reinstatements/${r.id}/cancel`, { reason })); }}>Cancel</button>}
              </td></tr>)}</tbody></table></div>}
          {handle && f.paid_minor > f.reinstated_minor && (
            <>
              <div className="ri-inline">
                <div className="field"><label htmlFor="ri-basis">Premium the rate applies to ({cur})</label><input id="ri-basis" inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="Placement premium at 100%" /></div>
                <button type="button" className="btn-secondary btn btn-sm" onClick={async () => { setFlash(null); try { setPreview(await api.get<ReinstatementCalc>(`${base}/reinstatement-preview${basis ? `?premium_basis=${encodeURIComponent(basis)}` : ""}`)); } catch (e) { setPreview(null); setFlash({ kind: "error", text: errorText(e) }); } }}>Calculate</button>
              </div>
              {preview && (
                <div>
                  <p>Restores <strong>{minorText(preview.amount_minor, cur)}</strong> of limit; premium due <strong>{minorText(preview.premium_minor, cur)}</strong> at 100% (on {minorText(preview.premium_basis_minor, cur)}, {preview.premium_basis_source.toLowerCase()}).</p>
                  <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinstatement</th><th className="ri-num">Amount</th><th className="ri-num">Rate</th><th>Basis</th><th className="ri-num">Premium</th></tr></thead>
                    <tbody>{preview.tranches.map((t) => <tr key={t.reinstatement_no}><td>{t.reinstatement_no}</td><td className="ri-num">{minorText(t.amount_minor, cur)}</td><td className="ri-num">{bpsText(t.premium_bps)}</td><td>{t.basis.replace(/_/g, " ")}</td><td className="ri-num">{minorText(t.premium_minor, cur)}</td></tr>)}</tbody></table></div>
                  {preview.time_factor && <p className="ri-note">Time factor {preview.time_factor.remaining_days} of {preview.time_factor.period_days} days remaining from the loss date.</p>}
                  {preview.unreinstated_minor > 0 && <p className="flash flash-warning">{minorText(preview.unreinstated_minor, cur)} of this loss is beyond the reinstatements available, so it restores no limit and carries no premium.</p>}
                  {preview.amount_minor > 0 && <button type="button" className="btn btn-sm" onClick={() => run("Reinstatement calculated and saved.", () => api.post(`${base}/reinstatements`, { premium_basis: basis || undefined }).then(() => setPreview(null)))}>Save this calculation</button>}
                </div>)}
              <p className="ri-note">The reinstatement terms are those entered on the treaty from its wording. Check the basis (especially "flat") against the wording before billing.</p>
            </>)}
        </div>)}
    </div>
  );
}

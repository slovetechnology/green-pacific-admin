import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { errorText, minorText, useReinsuranceStatus, type TreatyRow } from "../lib/reinsurance";
import { promptDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/reinsurance.css";

interface AccountRow { id: number; account_ref: string; treaty_id: number; treaty_ref: string; treaty_name: string; period_start: string; period_end: string; currency: string; status: string; issue_no: number; item_count: number }
interface Reinsurer { party_id: number; name: string; brought_forward_minor: number; movement_minor: number; closing_minor: number; items: { item_id: number; item_type: string; description: string | null; amount_minor: number }[] }
interface AccountView {
  account: AccountRow & { version: number; notes: string | null };
  statement: { reinsurers: Reinsurer[]; totals: { movement_minor: number; brought_forward_minor: number; closing_minor: number }; brought_forward_from: string | null; items: { id: number; item_type: string; description: string | null; amount_minor: number; source_billing_id: number | null; party_id: number | null }[]; cedant: { id: number; name: string } };
  issues: { issue_no: number; sha256: string; issued_by: string; issued_at: string }[];
  responses: { party_id: number; name: string; role: string; response: null | { status: string; note: string | null; recorded_by: string; recorded_at: string } }[];
}

export function TreatyAccountsListPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can, isLoading } = useReinsuranceStatus();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ treaty_id: params.get("treaty_id") || "", period_start: "", period_end: "" });
  const [error, setError] = useState<string | null>(null);
  const page = Number(params.get("page") || "1");
  const q = new URLSearchParams();
  if (params.get("status")) q.set("status", params.get("status")!);
  if (params.get("treaty_id")) q.set("treaty_id", params.get("treaty_id")!);
  q.set("limit", "25"); q.set("offset", String((page - 1) * 25));
  const list = useQuery({ queryKey: ["ri", "accounts", q.toString()], queryFn: () => api.get<{ rows: AccountRow[]; total: number }>(`/api/reinsurance/treaty-accounts?${q.toString()}`), enabled: can("ri.view") });
  const treaties = useQuery({ queryKey: ["ri", "treaties", "bound"], queryFn: () => api.get<{ rows: TreatyRow[] }>("/api/reinsurance/treaties?limit=200"), enabled: open });
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const columns: DataGridColumn<AccountRow>[] = [
    { key: "ref", header: "Account", render: (a) => <Link to={`/reinsurance/treaty-accounts/${a.id}`}>{a.account_ref}</Link> },
    { key: "treaty", header: "Treaty", render: (a) => (<>{a.treaty_ref}<div className="ri-note">{a.treaty_name}</div></>) },
    { key: "period", header: "Period", render: (a) => `${a.period_start} to ${a.period_end}` },
    { key: "items", header: "Items", align: "right", render: (a) => a.item_count },
    { key: "issue", header: "Issue", render: (a) => (a.issue_no ? `No. ${a.issue_no}` : "—") },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
  ];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Treaty accounts</h1></div>
        <div className="page-header-actions">{can("ri.accounts.post") && <button type="button" className="btn" onClick={() => setOpen((o) => !o)}>+ New account</button>}</div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {open && (
        <form className="card" onSubmit={async (e) => { e.preventDefault(); setError(null); try { const r = await api.post<{ account: { id: number } }>(`/api/reinsurance/treaties/${f.treaty_id}/accounts`, f); await qc.invalidateQueries({ queryKey: ["ri"] }); navigate(`/reinsurance/treaty-accounts/${r.account.id}`); } catch (er) { setError(errorText(er)); } }}>
          <div className="ri-inline">
            <div className="field"><label htmlFor="na-t">Treaty</label><select id="na-t" value={f.treaty_id} onChange={(e) => setF({ ...f, treaty_id: e.target.value })}><option value="">Choose…</option>{(treaties.data?.rows ?? []).filter((t) => ["Bound", "Active"].includes(t.status)).map((t) => <option key={t.id} value={t.id}>{t.treaty_ref} {t.name}</option>)}</select></div>
            <div className="field"><label htmlFor="na-s">Period start</label><input id="na-s" type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></div>
            <div className="field"><label htmlFor="na-e">Period end</label><input id="na-e" type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></div>
            <button className="btn btn-sm" type="submit" disabled={!f.treaty_id || !f.period_start || !f.period_end}>Open account</button>
          </div>
        </form>
      )}
      <div className="toolbar"><select aria-label="Status" value={params.get("status") || ""} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}><option value="">All statuses</option>{["Draft", "Issued", "Agreed", "Disputed"].map((s) => <option key={s}>{s}</option>)}</select></div>
      <DataGrid columns={columns} rows={list.data?.rows} isLoading={list.isLoading || isLoading} getRowKey={(a) => a.id} emptyMessage="No treaty accounts yet."
        paging={list.data ? { page, totalPages: Math.max(1, Math.ceil(list.data.total / 25)), total: list.data.total, onPageChange: (p) => setParams({ page: String(p) }) } : undefined} />
    </div>
  );
}

export function TreatyAccountDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [item, setItem] = useState({ item_type: "Reserve retained", amount: "", description: "", party_id: "", direction: "Paid to reinsurer", layer_id: "" });
  const [resp, setResp] = useState({ party_id: "", status: "Agreed", note: "" });
  const q = useQuery({ queryKey: ["ri", "account", id], queryFn: () => api.get<AccountView>(`/api/reinsurance/treaty-accounts/${id}`) });
  const meta = useQuery({ queryKey: ["ri", "acct-meta"], queryFn: () => api.get<{ itemTypes: string[] }>("/api/reinsurance/accounting-meta") });
  const v = q.data;
  const treaty = useQuery({ queryKey: ["ri", "treaty", v?.account.treaty_id], queryFn: () => api.get<{ layers: { id: number; layer_no: number }[] }>(`/api/reinsurance/treaties/${v!.account.treaty_id}`), enabled: Boolean(v) });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (q.isLoading) return <p>Loading…</p>;
  if (q.error || !v) return <div className="flash flash-error">{errorText(q.error) || "Account not found."}</div>;
  const a = v.account;
  const cur = a.currency;
  const base = `/api/reinsurance/treaty-accounts/${a.id}`;
  const draft = a.status === "Draft";
  const layers = treaty.data?.layers ?? [];
  const settle = item.item_type === "Settlement";
  return (
    <div>
      <div className="page-header"><div>
        <p className="eyebrow"><Link to="/reinsurance/treaty-accounts">Treaty accounts</Link> · <Link to={`/reinsurance/treaties/${a.treaty_id}`}>{a.treaty_ref}</Link> · {v.statement.cedant.name}</p>
        <h1>{a.account_ref} <StatusBadge status={a.status} /></h1>
        <p className="ri-note">{a.period_start} to {a.period_end} · {cur}{a.issue_no ? ` · issue ${a.issue_no}` : ""}{v.statement.brought_forward_from ? ` · balances brought forward from ${v.statement.brought_forward_from}` : ""}</p></div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`${base}/statement?format=pdf`)}>Statement (PDF)</a>
          <a className="btn-secondary btn" href={apiUrl(`${base}/statement?format=docx`)}>Word</a>
        </div></div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      <p className="ri-note">Amounts are from the reinsurer's side: a positive amount is owed to the reinsurer (premium, reserve released, interest) and a negative amount is owed by it (commission, brokerage, claims, reserve retained, a payment made to it).</p>

      <div className="card"><h2>By reinsurer</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinsurer</th><th className="ri-num">Brought forward</th><th className="ri-num">This period</th><th className="ri-num">Closing balance</th><th /></tr></thead>
          <tbody>{v.statement.reinsurers.map((r) => <tr key={r.party_id}><td>{r.name}<details><summary className="ri-note">{r.items.length} item(s)</summary><ul style={{ margin: 0, paddingLeft: "1rem" }}>{r.items.map((i, k) => <li key={k} className="ri-note">{i.item_type}{i.description ? `: ${i.description}` : ""} {minorText(i.amount_minor, cur)}</li>)}</ul></details></td>
            <td className="ri-num">{minorText(r.brought_forward_minor, cur)}</td><td className="ri-num">{minorText(r.movement_minor, cur)}</td><td className="ri-num"><strong>{minorText(r.closing_minor, cur)}</strong><div className="ri-note">{r.closing_minor >= 0 ? "due to the reinsurer" : "due from the reinsurer"}</div></td>
            <td><a className="btn-secondary btn btn-sm" href={apiUrl(`${base}/statement?format=pdf&party_id=${r.party_id}`)}>Statement</a></td></tr>)}
            <tr><th>Total</th><th className="ri-num">{minorText(v.statement.totals.brought_forward_minor, cur)}</th><th className="ri-num">{minorText(v.statement.totals.movement_minor, cur)}</th><th className="ri-num">{minorText(v.statement.totals.closing_minor, cur)}</th><th /></tr></tbody></table></div>
      </div>

      <div className="card"><h2>Items (for the whole treaty, split to the reinsurers by signed share)</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Detail</th><th className="ri-num">Amount</th><th /></tr></thead>
          <tbody>{!v.statement.items.length && <tr><td colSpan={4}>No items yet. Pull them in from the period's billings, or add them.</td></tr>}
            {v.statement.items.map((i) => <tr key={i.id}><td>{i.item_type}{i.party_id ? " (one reinsurer)" : ""}</td><td>{i.description || "—"}{i.source_billing_id && <div className="ri-note"><Link to={`/reinsurance/billings/${i.source_billing_id}`}>from a billing</Link></div>}</td><td className="ri-num">{minorText(i.amount_minor, cur)}</td>
              <td>{draft && !i.source_billing_id && can("ri.accounts.post") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Item removed.", () => api.delete(`${base}/items/${i.id}?expected_version=${a.version}`))}>Remove</button>}</td></tr>)}</tbody></table></div>
        {draft && can("ri.accounts.post") && (
          <>
            <div className="ri-inline">
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Billings pulled in.", () => api.post(`${base}/generate`, { expected_version: a.version }))}>Pull in the period's billings</button>
              <button type="button" className="btn btn-sm" disabled={!v.statement.items.length} onClick={() => run("Account issued.", () => api.post(`${base}/issue`, { expected_version: a.version }))}>Issue</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run("Item added.", () => api.post(`${base}/items`, { ...item, party_id: item.party_id ? Number(item.party_id) : undefined, layer_id: item.layer_id ? Number(item.layer_id) : undefined, direction: settle ? item.direction : undefined, expected_version: a.version }).then(() => setItem({ ...item, amount: "", description: "" }))); }}>
              <h3>Add an item</h3>
              <div className="ri-inline">
                <div className="field"><label htmlFor="i-type">Type</label><select id="i-type" value={item.item_type} onChange={(e) => setItem({ ...item, item_type: e.target.value })}>{(meta.data?.itemTypes ?? []).map((t) => <option key={t}>{t}</option>)}</select></div>
                <div className="field"><label htmlFor="i-amt">Amount ({cur}){item.item_type === "Other" ? ", + owed to reinsurer" : ""}</label><input id="i-amt" inputMode="decimal" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} /></div>
                {layers.length > 0 && <div className="field"><label htmlFor="i-layer">Layer</label><select id="i-layer" value={item.layer_id} onChange={(e) => setItem({ ...item, layer_id: e.target.value })}><option value="">Choose…</option>{layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}</option>)}</select></div>}
                <div className="field"><label htmlFor="i-party">Reinsurer{settle ? "" : " (blank = all by share)"}</label><select id="i-party" value={item.party_id} onChange={(e) => setItem({ ...item, party_id: e.target.value })}><option value="">{settle ? "Choose…" : "All, by share"}</option>{v.statement.reinsurers.map((r) => <option key={r.party_id} value={r.party_id}>{r.name}</option>)}</select></div>
                {settle && <div className="field"><label htmlFor="i-dir">Direction</label><select id="i-dir" value={item.direction} onChange={(e) => setItem({ ...item, direction: e.target.value })}><option>Paid to reinsurer</option><option>Received from reinsurer</option></select></div>}
                <div className="field"><label htmlFor="i-desc">Detail</label><input id="i-desc" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></div>
                <button className="btn btn-sm" type="submit" disabled={!item.amount}>Add</button>
              </div>
            </form>
          </>
        )}
      </div>

      {a.issue_no > 0 && (
        <div className="card"><h2>Responses to issue {a.issue_no}</h2>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Party</th><th>Role</th><th>Response</th><th>Note</th></tr></thead>
            <tbody>{v.responses.map((r) => <tr key={r.party_id}><td>{r.name}</td><td>{r.role}</td><td>{r.response ? <StatusBadge status={r.response.status} /> : <span className="muted">Awaiting</span>}</td><td>{r.response?.note || "—"}</td></tr>)}</tbody></table></div>
          {can("ri.accounts.post") && ["Issued", "Disputed"].includes(a.status) && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); run("Response recorded.", () => api.post(`${base}/responses`, { ...resp, party_id: Number(resp.party_id) }).then(() => setResp({ ...resp, note: "" }))); }}>
                <div className="ri-inline">
                  <div className="field"><label htmlFor="rs-p">Party</label><select id="rs-p" value={resp.party_id} onChange={(e) => setResp({ ...resp, party_id: e.target.value })}><option value="">Choose…</option>{v.responses.map((r) => <option key={r.party_id} value={r.party_id}>{r.name}</option>)}</select></div>
                  <div className="field"><label htmlFor="rs-s">Response</label><select id="rs-s" value={resp.status} onChange={(e) => setResp({ ...resp, status: e.target.value })}><option>Agreed</option><option>Disputed</option></select></div>
                  <div className="field"><label htmlFor="rs-n">Note{resp.status === "Disputed" ? " (what is disputed)" : ""}</label><input id="rs-n" value={resp.note} onChange={(e) => setResp({ ...resp, note: e.target.value })} /></div>
                  <button className="btn btn-sm" type="submit" disabled={!resp.party_id || (resp.status === "Disputed" && !resp.note)}>Record</button>
                </div>
              </form>
              <button type="button" className="btn-secondary btn btn-sm" onClick={async () => { const reason = await promptDialog({ message: "Why is the account being reopened?", required: true, multiline: true }); if (reason) run("Account reopened to correct it.", () => api.post(`${base}/reopen`, { reason })); }}>Reopen to correct</button>
            </>
          )}
          <h3>Issues</h3><ul>{v.issues.map((i) => <li key={i.issue_no} className="ri-note">Issue {i.issue_no} by {i.issued_by} on {i.issued_at}, fingerprint {i.sha256.slice(0, 12)}…</li>)}</ul>
        </div>
      )}
    </div>
  );
}

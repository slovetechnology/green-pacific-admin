import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { errorText, minorText, useReinsuranceStatus, type TreatyRow } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

interface Bdx {
  id: number; bordereau_ref: string; treaty_id: number; treaty_ref?: string; treaty_name?: string; kind: "Premium" | "Claims"; period_start: string; period_end: string; currency: string; status: string;
  row_count: number; valid_count: number; error_count: number; total_premium_minor: number; total_ceded_minor: number; total_commission_minor: number; total_paid_minor: number; total_os_minor: number;
  billing_id: number | null; file_name: string | null; match_counts: Record<string, number>; note: string | null;
}
interface Row { id: number; row_no: number; policy_no: string | null; insured: string | null; claim_no: string | null; inception: string | null; loss_date: string | null; premium_minor: number | null; ceded_minor: number | null; paid_minor: number | null; os_minor: number | null; status: string; match_status: string; variance_minor: number | null; errors: string[] }
interface Preview { headers: string[]; suggested: Record<string, string>; fields: { key: string; label: string; required: boolean }[]; rowCount: number; sample: string[][] }
interface Recon { skipped?: string; summary: Record<string, number>; totals?: { bordereau_premium_minor: number; erp_premium_minor: number; variance_minor: number }; missing_from_bordereau?: { count: number; premium_minor: number; sample: { id: number; policy_no: string; client: string; start_date: string; premium_minor: number }[] } }

export function BordereauxListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, isLoading } = useReinsuranceStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [treatyId, setTreatyId] = useState(params.get("treaty_id") || "");
  const [kind, setKind] = useState<"Premium" | "Claims">("Premium");
  const [period, setPeriod] = useState({ period_start: "", period_end: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const page = Number(params.get("page") || "1");
  const q = new URLSearchParams();
  for (const k of ["status", "kind", "treaty_id"]) if (params.get(k)) q.set(k, params.get(k)!);
  q.set("limit", "25"); q.set("offset", String((page - 1) * 25));
  const list = useQuery({ queryKey: ["ri", "bordereaux", q.toString()], queryFn: () => api.get<{ rows: Bdx[]; total: number }>(`/api/reinsurance/bordereaux?${q.toString()}`), enabled: can("ri.view") });
  const treaties = useQuery({ queryKey: ["ri", "treaties", "all"], queryFn: () => api.get<{ rows: TreatyRow[] }>("/api/reinsurance/treaties?limit=200"), enabled: can("ri.view") });

  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("kind", kind);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    f.set("file", fileRef.current!.files![0]);
    return f;
  };
  async function doPreview() {
    setError(null); setWarning(null);
    if (!treatyId) return setError("Choose the treaty.");
    if (!fileRef.current?.files?.[0]) return setError("Choose a file.");
    setBusy(true);
    try {
      const p = await api.upload<Preview>(`/api/reinsurance/treaties/${treatyId}/bordereaux/preview`, form());
      setPreview(p); setMapping(p.suggested);
    } catch (e) { setError(e instanceof ApiError ? e.message : errorText(e)); } finally { setBusy(false); }
  }
  async function doImport() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.upload<{ bordereau: Bdx; attachmentWarning: string | null }>(`/api/reinsurance/treaties/${treatyId}/bordereaux`, form({ ...period, mapping: JSON.stringify(mapping) }));
      await qc.invalidateQueries({ queryKey: ["ri"] });
      if (r.attachmentWarning) setWarning(r.attachmentWarning);
      navigate(`/reinsurance/bordereaux/${r.bordereau.id}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : errorText(e)); } finally { setBusy(false); }
  }
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const columns: DataGridColumn<Bdx>[] = [
    { key: "ref", header: "Bordereau", render: (b) => <Link to={`/reinsurance/bordereaux/${b.id}`}>{b.bordereau_ref}</Link> },
    { key: "treaty", header: "Treaty", render: (b) => (<>{b.treaty_ref}<div className="ri-note">{b.treaty_name}</div></>) },
    { key: "kind", header: "Type", render: (b) => b.kind },
    { key: "period", header: "Period", render: (b) => `${b.period_start} to ${b.period_end}` },
    { key: "rows", header: "Rows", align: "right", render: (b) => (<>{b.valid_count}{b.error_count > 0 && <span className="badge badge-declined"> {b.error_count} errors</span>}</>) },
    { key: "amt", header: "Total", align: "right", render: (b) => minorText(b.kind === "Premium" ? b.total_ceded_minor : b.total_paid_minor, b.currency) },
    { key: "st", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
  ];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Bordereaux</h1></div>
        <div className="page-header-actions"><a className="btn-secondary btn" href={apiUrl("/api/reinsurance/bordereaux/template?kind=Premium")}>Premium template</a><a className="btn-secondary btn" href={apiUrl("/api/reinsurance/bordereaux/template?kind=Claims")}>Claims template</a></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      {warning && <div className="flash flash-warning">{warning}</div>}
      {can("ri.accounts.post") && (
        <div className="card"><h2>Import a bordereau</h2>
          <p className="ri-note">A CSV or Excel file from the cedant. Dates are day/month/year or year-month-day. A blank required amount is an error, never zero; rows with errors are kept, listed in an error report, and left out until the cedant corrects them.</p>
          <div className="ri-inline">
            <div className="field"><label htmlFor="bx-t">Treaty</label><select id="bx-t" value={treatyId} onChange={(e) => setTreatyId(e.target.value)}><option value="">Choose…</option>{(treaties.data?.rows ?? []).map((t) => <option key={t.id} value={t.id}>{t.treaty_ref} {t.name}</option>)}</select></div>
            <div className="field"><label htmlFor="bx-k">Type</label><select id="bx-k" value={kind} onChange={(e) => { setKind(e.target.value as "Premium" | "Claims"); setPreview(null); }}><option>Premium</option><option>Claims</option></select></div>
            <div className="field"><label htmlFor="bx-s">Period start</label><input id="bx-s" type="date" value={period.period_start} onChange={(e) => setPeriod({ ...period, period_start: e.target.value })} /></div>
            <div className="field"><label htmlFor="bx-e">Period end</label><input id="bx-e" type="date" value={period.period_end} onChange={(e) => setPeriod({ ...period, period_end: e.target.value })} /></div>
            <div className="field"><label htmlFor="bx-f">File</label><input id="bx-f" type="file" accept=".csv,.xlsx" ref={fileRef} onChange={() => setPreview(null)} /></div>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={doPreview}>Read the file</button>
          </div>
          {preview && (
            <>
              <h3>Match the columns ({preview.rowCount} rows)</h3>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>Our field</th><th>Column in the file</th></tr></thead>
                <tbody>{preview.fields.map((f) => <tr key={f.key}><td>{f.label}{f.required && " *"}</td><td><select aria-label={f.label} value={mapping[f.key] || ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}><option value="">{f.required ? "Choose…" : "Not in the file"}</option>{preview.headers.map((h) => <option key={h}>{h}</option>)}</select></td></tr>)}</tbody></table></div>
              <details><summary className="ri-note">First rows of the file</summary><div className="table-wrap"><table className="data-table"><thead><tr>{preview.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.sample.map((r, i) => <tr key={i}>{preview.headers.map((_, j) => <td key={j}>{String(r[j] ?? "")}</td>)}</tr>)}</tbody></table></div></details>
              <button type="button" className="btn btn-sm" disabled={busy || !period.period_start || !period.period_end || preview.fields.some((f) => f.required && !mapping[f.key])} onClick={doImport}>{busy ? "Importing…" : "Import"}</button>
            </>
          )}
        </div>
      )}
      <div className="toolbar">
        <select aria-label="Type" value={params.get("kind") || ""} onChange={(e) => setParams(e.target.value ? { kind: e.target.value } : {})}><option value="">Premium and claims</option><option>Premium</option><option>Claims</option></select>
        <select aria-label="Status" value={params.get("status") || ""} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}><option value="">All statuses</option>{["Imported", "Accepted", "Billed", "Rejected"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <DataGrid columns={columns} rows={list.data?.rows} isLoading={list.isLoading || isLoading} getRowKey={(b) => b.id} emptyMessage="No bordereaux yet."
        paging={list.data ? { page, totalPages: Math.max(1, Math.ceil(list.data.total / 25)), total: list.data.total, onPageChange: (p) => setParams({ page: String(p) }) } : undefined} />
    </div>
  );
}

export function BordereauDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useReinsuranceStatus();
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [filter, setFilter] = useState({ status: "", match: "" });
  const [recon, setRecon] = useState<Recon | null>(null);
  const [bill, setBill] = useState({ billed_date: "", due_date: "", layer_id: "" });
  const q = useQuery({ queryKey: ["ri", "bordereau", id], queryFn: () => api.get<{ bordereau: Bdx }>(`/api/reinsurance/bordereaux/${id}`) });
  const rows = useQuery({ queryKey: ["ri", "bordereau-rows", id, filter, q.data?.bordereau.status], queryFn: () => api.get<{ rows: Row[]; total: number }>(`/api/reinsurance/bordereaux/${id}/rows?limit=100${filter.status ? `&status=${filter.status}` : ""}${filter.match ? `&match=${encodeURIComponent(filter.match)}` : ""}`) });
  const b = q.data?.bordereau;
  const treaty = useQuery({ queryKey: ["ri", "treaty", b?.treaty_id], queryFn: () => api.get<{ layers: { id: number; layer_no: number }[] }>(`/api/reinsurance/treaties/${b!.treaty_id}`), enabled: Boolean(b) });
  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (q.isLoading) return <p>Loading…</p>;
  if (q.error || !b) return <div className="flash flash-error">{errorText(q.error) || "Bordereau not found."}</div>;
  const premium = b.kind === "Premium";
  const base = `/api/reinsurance/bordereaux/${b.id}`;
  const layers = treaty.data?.layers ?? [];
  const money = (n: number) => minorText(n, b.currency);
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow"><Link to="/reinsurance/bordereaux">Bordereaux</Link> · {b.kind} · <Link to={`/reinsurance/treaties/${b.treaty_id}`}>treaty</Link></p>
        <h1>{b.bordereau_ref} <StatusBadge status={b.status} /></h1>
        <p className="ri-note">{b.file_name} · {b.period_start} to {b.period_end}{b.billing_id && <> · <Link to={`/reinsurance/billings/${b.billing_id}`}>billing</Link></>}</p></div>
        <div className="page-header-actions">{b.error_count > 0 && <a className="btn-secondary btn" href={apiUrl(`${base}/errors.csv`)}>Error report (CSV)</a>}</div></div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      <div className="card"><h2>Totals (valid rows only)</h2>
        <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {([["Rows", `${b.row_count} (${b.valid_count} valid, ${b.error_count} with errors)`], ...(premium
            ? [["Gross premium", money(b.total_premium_minor)], ["Ceded premium", money(b.total_ceded_minor)], ["Commission", money(b.total_commission_minor)]]
            : [["Paid", money(b.total_paid_minor)], ["Outstanding reserve", money(b.total_os_minor)]])] as [string, string][]).map(([k, val]) => <div key={k}><div className="k">{k}</div><div className="v">{val}</div></div>)}
        </div>
        {b.status === "Imported" && can("ri.accounts.post") && (
          <div className="ri-inline">
            <button type="button" className="btn btn-sm" disabled={!b.valid_count} onClick={() => { if (b.error_count && !window.confirm(`${b.error_count} row(s) have errors and will be left out. Accept the rest?`)) return; run("Bordereau accepted.", () => api.post(`${base}/decision`, { decision: "accept", exclude_errors: true })); }}>Accept</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => { const note = window.prompt("Why is it rejected?"); if (note) run("Bordereau rejected.", () => api.post(`${base}/decision`, { decision: "reject", note })); }}>Reject</button>
          </div>
        )}
        {b.status === "Accepted" && can("ri.accounts.post") && (
          <form onSubmit={(e) => { e.preventDefault(); run(`${premium ? "Premium" : "Claim"} billed.`, () => api.post(`${base}/bill`, { ...bill, layer_id: bill.layer_id ? Number(bill.layer_id) : undefined, billed_date: bill.billed_date || undefined })); }}>
            <h3>Bill it</h3>
            <p className="ri-note">Creates a {premium ? "premium billing for the ceded premium" : "claim billing for the paid claims"}, split to the reinsurers by signed share.</p>
            <div className="ri-inline">
              {layers.length > 1 && <div className="field"><label htmlFor="bb-l">Layer</label><select id="bb-l" value={bill.layer_id} onChange={(e) => setBill({ ...bill, layer_id: e.target.value })}><option value="">Choose…</option>{layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}</option>)}</select></div>}
              <div className="field"><label htmlFor="bb-b">Billed on</label><input id="bb-b" type="date" value={bill.billed_date} onChange={(e) => setBill({ ...bill, billed_date: e.target.value })} /></div>
              <div className="field"><label htmlFor="bb-d">Due on</label><input id="bb-d" type="date" value={bill.due_date} onChange={(e) => setBill({ ...bill, due_date: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!bill.due_date || (layers.length > 1 && !bill.layer_id)}>Bill</button>
            </div>
          </form>
        )}
      </div>

      <div className="card"><h2>Reconcile to our own records</h2>
        <p className="ri-note">{premium ? "Each valid row is matched to a policy of the cedant's insurer by policy number, narrowed by inception date and nearest premium. A premium within NGN 1 of ours counts as matched." : "Claims are matched to our policies by policy number."}</p>
        {can("ri.accounts.post") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Reconciled.", async () => setRecon(await api.post<Recon>(`${base}/reconcile`)))}>Reconcile now</button>}
        {recon?.skipped && <div className="flash flash-warning">{recon.skipped}</div>}
        {(recon?.summary || b.match_counts) && <p>{Object.entries(recon?.summary ?? b.match_counts).map(([k, n]) => <span key={k} className="badge badge-secondary" style={{ marginRight: "0.4rem" }}>{k}: {n}</span>)}</p>}
        {recon?.totals && <p>Bordereau premium {money(recon.totals.bordereau_premium_minor)} against our policies {money(recon.totals.erp_premium_minor)}; difference <strong>{money(recon.totals.variance_minor)}</strong>.</p>}
        {recon?.missing_from_bordereau && recon.missing_from_bordereau.count > 0 && (
          <><h3>In our register for the period but not on the bordereau ({recon.missing_from_bordereau.count}, {money(recon.missing_from_bordereau.premium_minor)})</h3>
            <ul>{recon.missing_from_bordereau.sample.map((s) => <li key={s.id} className="ri-note">{s.policy_no}, {s.client}, from {s.start_date}, {money(s.premium_minor)}</li>)}</ul></>
        )}
      </div>

      <div className="card"><h2>Rows</h2>
        <div className="toolbar">
          <select aria-label="Row status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All rows</option><option>Valid</option><option>Error</option><option>Excluded</option></select>
          {premium && <select aria-label="Match" value={filter.match} onChange={(e) => setFilter({ ...filter, match: e.target.value })}><option value="">Any match</option>{["Matched", "Variance", "Not found", "Duplicate", "Unchecked"].map((m) => <option key={m}>{m}</option>)}</select>}
          <span className="ri-note">{rows.data?.total ?? 0} row(s)</span>
        </div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>{premium ? "Policy" : "Claim"}</th><th>Insured</th>{premium ? <><th className="ri-num">Premium</th><th className="ri-num">Ceded</th></> : <><th>Loss date</th><th className="ri-num">Paid</th><th className="ri-num">Outstanding</th></>}<th>Check</th><th>Problems</th></tr></thead>
          <tbody>{(rows.data?.rows ?? []).map((r) => (
            <tr key={r.id} style={r.status === "Error" ? { background: "color-mix(in srgb, var(--status-critical) 8%, transparent)" } : undefined}>
              <td>{r.row_no}</td><td>{premium ? r.policy_no : r.claim_no}{!premium && r.policy_no && <div className="ri-note">{r.policy_no}</div>}</td><td>{r.insured || "—"}</td>
              {premium ? <><td className="ri-num">{r.premium_minor != null ? money(r.premium_minor) : "—"}</td><td className="ri-num">{r.ceded_minor != null ? money(r.ceded_minor) : "—"}</td></> : <><td>{r.loss_date || "—"}</td><td className="ri-num">{r.paid_minor != null ? money(r.paid_minor) : "—"}</td><td className="ri-num">{r.os_minor != null ? money(r.os_minor) : "—"}</td></>}
              <td>{r.status !== "Valid" ? <StatusBadge status={r.status} /> : r.match_status}{r.variance_minor ? <div className="ri-note">differs by {money(r.variance_minor)}</div> : null}</td>
              <td>{r.errors.length ? <ul style={{ margin: 0, paddingLeft: "1rem" }}>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : ""}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}

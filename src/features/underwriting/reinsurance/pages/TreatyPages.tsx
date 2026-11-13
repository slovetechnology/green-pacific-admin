import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { bpsText, errorText, minorDecimal, minorText, useReinsuranceStatus, type TreatyRow, type TreatyView, type YoY } from "../lib/reinsurance";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { TreatyTermsForm } from "../components/TreatyForm";
import { emptyTerms, termsFrom, termsPayload, type TermsState } from "../lib/treatyTerms";
import "@/shared/styles/executive.css";
import "@/shared/styles/reinsurance.css";

const EDITABLE = ["Draft", "Marketing"];

export function TreatiesListPage() {
  const [params, setParams] = useSearchParams();
  const { can, status, isLoading: sl } = useReinsuranceStatus();
  const [qInput, setQInput] = useState(params.get("q") || "");
  const page = Number(params.get("page") || "1");
  const query = new URLSearchParams();
  for (const k of ["status", "q"]) if (params.get(k)) query.set(k, params.get(k)!);
  query.set("limit", "25");
  query.set("offset", String((page - 1) * 25));
  const list = useQuery({ queryKey: ["ri", "treaties", query.toString()], queryFn: () => api.get<{ rows: TreatyRow[]; total: number }>(`/api/reinsurance/treaties?${query.toString()}`), enabled: can("ri.view") });
  const update = (next: Record<string, string>) => {
    const merged: Record<string, string> = {};
    for (const k of ["status", "q"]) if (params.get(k)) merged[k] = params.get(k)!;
    Object.assign(merged, { page: "1" }, next);
    for (const k of Object.keys(merged)) if (!merged[k]) delete merged[k];
    setParams(merged);
  };
  if (!sl && !status?.enabled) return <div className="flash flash-info">The reinsurance module is switched off.</div>;
  if (!sl && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const columns: DataGridColumn<TreatyRow>[] = [
    { key: "ref", header: "Treaty", render: (t) => (<><Link to={`/reinsurance/treaties/${t.id}`}>{t.treaty_ref}</Link><div className="ri-note">{t.name}</div></>) },
    { key: "type", header: "Type", render: (t) => (<>{t.treaty_type}<div className="ri-note">{t.basis}</div></>) },
    { key: "cedant", header: "Cedant", render: (t) => t.cedant_name },
    { key: "class", header: "Class", render: (t) => t.class_of_business || "—" },
    { key: "period", header: "Period", render: (t) => `${t.period_start} to ${t.period_end}` },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.display_status} /> },
    { key: "pl", header: "Placement", render: (t) => (t.placement_id ? <Link to={`/reinsurance/placements/${t.placement_id}`}>Open</Link> : "—") },
  ];
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Treaties</h1></div>
        <div className="page-header-actions">
          <Link className="btn-secondary btn" to="/reinsurance/renewals">Renewals due</Link>
          {can("ri.treaty.edit") && <Link className="btn" to="/reinsurance/treaties/new">+ New treaty</Link>}
        </div></div>
      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); update({ q: qInput }); }} style={{ display: "flex", gap: "0.5rem" }}>
          <input type="search" placeholder="Search reference, name, cedant…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button type="submit" className="btn-secondary btn">Search</button>
        </form>
        <select aria-label="Status" value={params.get("status") || ""} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>{["Draft", "Marketing", "Bound", "Active", "Expired", "Cancelled", "Run-off"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <DataGrid columns={columns} rows={list.data?.rows} isLoading={list.isLoading || sl} getRowKey={(t) => t.id} emptyMessage="No treaties yet."
        paging={list.data ? { page, totalPages: Math.max(1, Math.ceil(list.data.total / 25)), total: list.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined} />
    </div>
  );
}

export function TreatyNewPage() {
  const navigate = useNavigate();
  const { can, isLoading } = useReinsuranceStatus();
  const [state, setState] = useState<TermsState>(emptyTerms());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!isLoading && !can("ri.treaty.edit")) return <div className="flash flash-error">You don't have permission to create treaties.</div>;
  async function submit() {
    setError(null);
    if (!state.cedant_party_id) return setError("Choose the cedant.");
    const { body, error: err } = termsPayload(state, true);
    if (err || !body) return setError(err || "Check the form.");
    setBusy(true);
    try {
      const res = await api.post<{ treaty: { id: number } }>("/api/reinsurance/treaties", body);
      navigate(`/reinsurance/treaties/${res.treaty.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorText(e));
    } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>New treaty</h1></div>
        <div className="page-header-actions"><Link className="btn-secondary btn" to="/reinsurance/treaties">Back</Link></div></div>
      {error && <div className="flash flash-error">{error}</div>}
      <TreatyTermsForm state={state} setState={setState} creating onSubmit={submit} busy={busy} submitLabel="Create treaty" />
      <p className="ri-note">Add the layers of an excess-of-loss treaty on the next screen. Amounts are plain numbers in the chosen currency; percentages are plain numbers such as 27.5.</p>
    </div>
  );
}

function kv(pairs: [string, string][]) {
  return <div className="detail-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>{pairs.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v || "—"}</div></div>)}</div>;
}

export function TreatyDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = useReinsuranceStatus();
  const [tab, setTab] = useState("terms");
  const [flash, setFlash] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [terms, setTerms] = useState<TermsState>(emptyTerms());
  const [layersDraft, setLayersDraft] = useState<{ layer_no: string; description: string; limit: string; retention: string; rate: string; deposit: string }[] | null>(null);
  const [exp, setExp] = useState({ underwriting_year: "", spi: "", ceded_premium: "", paid_losses: "", os_reserves: "", claims_count: "", large_loss_count: "", notes: "" });
  const [end, setEnd] = useState({ kind: "Alteration", effective_date: "", description: "", field: "mdp", value: "" });

  const q = useQuery({ queryKey: ["ri", "treaty", id], queryFn: () => api.get<TreatyView>(`/api/reinsurance/treaties/${id}`) });
  const yoy = useQuery({ queryKey: ["ri", "treaty-compare", id], queryFn: () => api.get<{ comparison: YoY }>(`/api/reinsurance/treaties/${id}/compare`), enabled: tab === "compare" });
  const alterable = useQuery({ queryKey: ["ri", "treaty-meta"], queryFn: () => api.get<{ alterableFields: string[] }>("/api/reinsurance/treaty-meta") });
  const v = q.data;

  async function run(done: string, fn: () => Promise<unknown>) {
    setFlash(null);
    try { await fn(); setFlash({ kind: "success", text: done }); } catch (e) { setFlash({ kind: "error", text: errorText(e) }); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  }
  if (q.isLoading) return <p>Loading…</p>;
  if (q.error || !v) return <div className="flash flash-error">{errorText(q.error) || "Treaty not found."}</div>;
  const t = v.treaty;
  const cur = t.currency;
  const editable = EDITABLE.includes(t.status);
  const canEdit = can("ri.treaty.edit") && editable;
  const base = `/api/reinsurance/treaties/${t.id}`;
  const pendingEnds = v.endorsements.filter((e) => e.status === "Pending").length;
  const tabs: TabDef[] = [
    { id: "terms", label: "Terms" }, { id: "layers", label: "Layers", count: v.layers.length || undefined }, { id: "clauses", label: "Clauses", count: v.clauses.length || undefined },
    { id: "experience", label: "Experience", count: v.experience.length || undefined }, { id: "endorsements", label: "Endorsements", count: pendingEnds || v.endorsements.length || undefined },
    { id: "versions", label: "Versions", count: v.versions.length }, { id: "compare", label: "Compare with last year" }, { id: "attachments", label: "Attachments" },
  ];
  const c = t.commission;

  function startEdit() { setTerms(termsFrom(t)); setEditing(true); }
  async function saveTerms() {
    const { body, error } = termsPayload(terms, false);
    if (error || !body) return setFlash({ kind: "error", text: error || "Check the form." });
    await run("Terms saved.", () => api.put(base, { ...body, expected_version: t.version }).then(() => setEditing(false)));
  }
  function startLayers() {
    setLayersDraft(v!.layers.map((l) => ({ layer_no: String(l.layer_no), description: l.description || "", limit: minorDecimal(l.limit_minor), retention: minorDecimal(l.retention_minor), rate: l.rate_bps != null ? (l.rate_bps / 100).toFixed(2) : "", deposit: minorDecimal(l.deposit_premium_minor) })));
  }
  const rateBps = (text: string) => (text.trim() === "" ? undefined : Math.round(Number(text) * 100));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/reinsurance/treaties">Treaties</Link> · {t.treaty_type} · {v.cedant.name}</p>
          <h1>{t.treaty_ref} <StatusBadge status={t.display_status || t.status} /></h1>
          <p className="ri-note">{t.name} · {t.period_start} to {t.period_end} · version {t.version}
            {v.previous && <> · renews <Link to={`/reinsurance/treaties/${v.previous.id}`}>{v.previous.treaty_ref}</Link></>}
            {v.next && <> · renewed by <Link to={`/reinsurance/treaties/${v.next.id}`}>{v.next.treaty_ref}</Link></>}</p>
        </div>
        <div className="page-header-actions">
          {v.placement ? <Link className="btn" to={`/reinsurance/placements/${v.placement.id}`}>Placement {v.placement.placement_ref}</Link>
            : can("ri.placement.edit") && editable && <button type="button" className="btn" onClick={() => run("Placement opened.", async () => { const r = await api.post<{ placementId: number }>(`${base}/placement`, {}); navigate(`/reinsurance/placements/${r.placementId}`); })}>Open placement</button>}
          <Link className="btn-secondary btn" to={`/reinsurance/treaty-accounts?treaty_id=${t.id}`}>Accounts</Link>
          <Link className="btn-secondary btn" to={`/reinsurance/bordereaux?treaty_id=${t.id}`}>Bordereaux</Link>
          <Link className="btn-secondary btn" to={`/reinsurance/claims?treaty_id=${t.id}`}>Claims</Link>
          <Link className="btn-secondary btn" to={`/reinsurance/treaties/${t.id}/calculators`}>Calculators</Link>
          <a className="btn-secondary btn" href={apiUrl(`${base}/bordereaux-export?period_start=${t.period_start}&period_end=${t.period_end}`)}>Export premium bordereau</a>
          {can("ri.treaty.edit") && can("ri.placement.edit") && !v.next && ["Bound", "Active", "Run-off"].includes(t.status) && (
            <button type="button" className="btn-secondary btn" onClick={() => { if (window.confirm("Renew this treaty for the next period? A draft is created with last year's terms and reinsurers invited.")) run("Renewal opened.", async () => { const r = await api.post<{ treatyId: number; placementId: number }>(`${base}/renew`, {}); navigate(`/reinsurance/placements/${r.placementId}`); }); }}>Renew</button>
          )}
        </div>
      </div>
      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      {editable && (v.readiness.blockers.length > 0 || v.readiness.warnings.length > 0) && (
        <div className="ri-alerts">
          {v.readiness.blockers.length > 0 && <div className="flash flash-error">Not ready to market:<ul>{v.readiness.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          {v.readiness.warnings.length > 0 && <div className="flash flash-warning">Check:<ul>{v.readiness.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
        </div>
      )}
      {!editable && <div className="flash flash-info">This treaty is {t.status.toLowerCase()}, so its terms are locked. Changes are made by endorsement and need a second person's approval.</div>}

      <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="tr" label="Treaty sections" />
      <div role="tabpanel" id={`tr-panel-${tab}`} aria-labelledby={`tr-tab-${tab}`} tabIndex={0} className="exec-tabpanel">
        {tab === "terms" && (editing ? (
          <TreatyTermsForm state={terms} setState={setTerms} creating={false} onSubmit={saveTerms} onCancel={() => setEditing(false)} busy={false} submitLabel="Save terms" />
        ) : (
          <div className="card">
            <h2>Terms</h2>
            {kv([
              ["Type", t.treaty_type], ["Basis", t.basis], ["Treaty year", String(t.treaty_year)], ["Class", t.class_of_business || ""], ["Sub-classes", t.sub_classes.join(", ")], ["Territory", t.territorial_scope || ""],
              ["Retention", minorText(t.retention_minor, cur)], ["Limit", minorText(t.limit_minor, cur)], ["Lines", t.lines_count ? String(t.lines_count) : ""],
              ["Cession", t.cession_bps != null ? bpsText(t.cession_bps) : ""], ["Ceding commission", t.ceding_commission_bps != null ? bpsText(t.ceding_commission_bps) : ""],
              ["Brokerage", t.brokerage_bps != null ? `${bpsText(t.brokerage_bps)}${t.brokerage_deducted_from ? ` from the ${t.brokerage_deducted_from.toLowerCase()}` : ""}` : ""],
              ["Estimated premium income", minorText(t.epi_minor, cur)], ["Minimum and deposit premium", minorText(t.mdp_minor, cur)], ["Minimum premium", minorText(t.min_premium_minor, cur)],
              ["Rate on subject premium", t.rate_on_spi_bps != null ? bpsText(t.rate_on_spi_bps) : ""],
              ["Premium payment warranty", t.premium_payment_warranty_days ? `${t.premium_payment_warranty_days} days${t.no_premium_no_cover ? ", no premium no cover" : ""}` : ""],
            ])}
            <h3>Commission</h3>
            <p>{c.type === "flat" ? `Flat ${bpsText(c.flat?.rate_bps)}` : c.type === "sliding" ? `Sliding scale: provisional ${bpsText(c.sliding?.provisional_bps)}, minimum ${bpsText(c.sliding?.min_bps)}, maximum ${bpsText(c.sliding?.max_bps)}` : "No separate commission structure."}
              {c.profit && ` Profit commission ${bpsText(c.profit.share_bps)} after ${bpsText(c.profit.management_expense_bps)} management expense; deficit carried forward ${c.profit.deficit_carry_forward_years} year(s).`}</p>
            {c.sliding && <div className="table-wrap"><table className="data-table"><thead><tr><th className="ri-num">Loss ratio from</th><th className="ri-num">to</th><th className="ri-num">Commission</th></tr></thead>
              <tbody>{c.sliding.bands.map((b, i) => <tr key={i}><td className="ri-num">{bpsText(b.lr_from_bps)}</td><td className="ri-num">{b.lr_to_bps == null ? "and above" : bpsText(b.lr_to_bps)}</td><td className="ri-num">{bpsText(b.commission_bps)}</td></tr>)}</tbody></table></div>}
            <h3>Reinstatements</h3>
            {t.reinstatements.length ? <ul>{t.reinstatements.map((r, i) => <li key={i}>Reinstatement {i + 1}: {bpsText(r.premium_bps)} additional premium, {r.basis.replace(/_/g, " ")}</li>)}</ul> : <p>None.</p>}
            {t.exclusions && <><h3>Exclusions</h3><p>{t.exclusions}</p></>}
            {t.special_conditions && <><h3>Special conditions</h3><p>{t.special_conditions}</p></>}
            {canEdit && <button type="button" className="btn btn-sm" onClick={startEdit}>Edit terms</button>}
            <p className="ri-note">Sliding-scale and profit commission, reinstatement premium and the minimum and deposit premium adjustment are stored here; the calculators arrive in a later phase.</p>
          </div>
        ))}

        {tab === "layers" && (
          <div className="card"><h2>Layers</h2>
            {layersDraft === null ? (
              <>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Layer</th><th>Description</th><th className="ri-num">Limit</th><th className="ri-num">Retention</th><th className="ri-num">Rate</th><th className="ri-num">Deposit premium</th></tr></thead>
                  <tbody>{!v.layers.length && <tr><td colSpan={6}>No layers. Excess-of-loss and stop-loss treaties need at least one.</td></tr>}
                    {v.layers.map((l) => <tr key={l.id}><td>{l.layer_no}</td><td>{l.description || "—"}</td><td className="ri-num">{minorText(l.limit_minor, cur)}</td><td className="ri-num">{minorText(l.retention_minor, cur)}</td><td className="ri-num">{l.rate_bps != null ? bpsText(l.rate_bps) : "—"}</td><td className="ri-num">{minorText(l.deposit_premium_minor, cur)}</td></tr>)}</tbody></table></div>
                {canEdit && <button type="button" className="btn btn-sm" onClick={startLayers}>Edit layers</button>}
              </>
            ) : (
              <>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>#</th><th>Description</th><th className="ri-num">Limit</th><th className="ri-num">Retention</th><th className="ri-num">Rate (%)</th><th className="ri-num">Deposit premium</th><th /></tr></thead>
                  <tbody>{layersDraft.map((l, i) => (
                    <tr key={i}>{(["layer_no", "description", "limit", "retention", "rate", "deposit"] as const).map((k) => (
                      <td key={k}><input aria-label={`Layer ${i + 1} ${k}`} value={l[k]} onChange={(e) => setLayersDraft(layersDraft.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></td>))}
                      <td><button type="button" className="btn-secondary btn btn-sm" onClick={() => setLayersDraft(layersDraft.filter((_, j) => j !== i))}>Remove</button></td></tr>))}</tbody></table></div>
                <div className="ri-inline">
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => setLayersDraft([...layersDraft, { layer_no: String(layersDraft.length + 1), description: "", limit: "", retention: "", rate: "", deposit: "" }])}>Add layer</button>
                  <button type="button" className="btn btn-sm" onClick={() => run("Layers saved.", () => api.put(`${base}/layers`, { expected_version: t.version, layers: layersDraft.map((l) => ({ layer_no: Number(l.layer_no), description: l.description, limit: l.limit, retention: l.retention, rate_bps: rateBps(l.rate), deposit_premium: l.deposit })) }).then(() => setLayersDraft(null)))}>Save layers</button>
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => setLayersDraft(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "clauses" && (
          <div className="card"><h2>Clauses</h2>
            <p className="ri-note">From the Clause Library: entries with product "Reinsurance" for this class. Add loss-occurrence definitions, hours clauses, sunset, cut-through, errors and omissions, access to records and intermediary clauses there with that product and a category in the risk type field.</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Clause</th><th>Category</th><th /></tr></thead>
              <tbody>{!v.availableClauses.length && <tr><td colSpan={4}>No reinsurance clauses in the library for this class.</td></tr>}
                {v.availableClauses.map((cl) => <tr key={cl.id}><td>{cl.code}</td><td>{cl.title}{cl.is_mandatory && <span className="badge badge-warning"> mandatory</span>}</td><td>{cl.category || "—"}</td>
                  <td>{canEdit && (cl.attached ? <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Clause removed.", () => api.delete(`${base}/clauses/${cl.id}`))}>Remove</button>
                    : <button type="button" className="btn btn-sm" onClick={() => run("Clause attached.", () => api.post(`${base}/clauses`, { clause_id: cl.id }))}>Attach</button>)}{!canEdit && cl.attached && "Attached"}</td></tr>)}</tbody></table></div>
          </div>
        )}

        {tab === "experience" && (
          <div className="card"><h2>Loss and exposure experience</h2>
            <p className="ri-note">Entered by hand for now, and used in the renewal submission. Loss ratio is incurred losses over ceded premium. Earlier years of a renewed treaty are included.</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Year</th><th>Treaty</th><th className="ri-num">Subject premium</th><th className="ri-num">Ceded premium</th><th className="ri-num">Paid</th><th className="ri-num">Outstanding</th><th className="ri-num">Incurred</th><th className="ri-num">Loss ratio</th><th className="ri-num">Claims</th><th className="ri-num">Large</th></tr></thead>
              <tbody>{!v.experience.length && <tr><td colSpan={10}>No experience recorded.</td></tr>}
                {v.experience.map((e) => <tr key={e.id}><td>{e.underwriting_year}</td><td>{e.treaty_ref}</td><td className="ri-num">{minorText(e.spi_minor, e.currency)}</td><td className="ri-num">{minorText(e.ceded_premium_minor, e.currency)}</td>
                  <td className="ri-num">{minorText(e.paid_losses_minor, e.currency)}</td><td className="ri-num">{minorText(e.os_reserves_minor, e.currency)}</td><td className="ri-num">{minorText(e.incurred_minor, e.currency)}</td>
                  <td className="ri-num">{e.loss_ratio_bps != null ? bpsText(e.loss_ratio_bps) : "—"}</td><td className="ri-num">{e.claims_count}</td><td className="ri-num">{e.large_loss_count}</td></tr>)}</tbody></table></div>
            {can("ri.treaty.edit") && (
              <form onSubmit={(e) => { e.preventDefault(); run("Experience saved.", () => api.put(`${base}/experience`, exp)); }}>
                <div className="ri-inline">
                  {([["underwriting_year", "Year"], ["spi", "Subject premium"], ["ceded_premium", "Ceded premium"], ["paid_losses", "Paid losses"], ["os_reserves", "Outstanding reserves"], ["claims_count", "Claims"], ["large_loss_count", "Large losses"]] as const).map(([k, label]) => (
                    <div className="field" key={k}><label htmlFor={`x-${k}`}>{label}</label><input id={`x-${k}`} value={exp[k]} onChange={(e) => setExp({ ...exp, [k]: e.target.value })} /></div>))}
                  <button className="btn btn-sm" type="submit" disabled={!exp.underwriting_year}>Save year</button>
                </div>
              </form>
            )}
          </div>
        )}

        {tab === "endorsements" && (
          <div>
            <div className="card"><h2>Endorsements, cancellation and run-off</h2>
              <p className="ri-note">After binding, the terms change only by endorsement, and a different person approves it. Cancellation ends the treaty from its effective date; run-off stops new business and keeps the period.</p>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>No.</th><th>Kind</th><th>Effective</th><th>Description</th><th>Changes</th><th>Status</th><th /></tr></thead>
                <tbody>{!v.endorsements.length && <tr><td colSpan={7}>None.</td></tr>}
                  {v.endorsements.map((e) => (
                    <tr key={e.id}><td>{e.endorsement_no}</td><td>{e.kind}</td><td>{e.effective_date}</td><td>{e.description}<div className="ri-note">{e.requested_by}{e.decided_by ? `, decided by ${e.decided_by}` : ""}{e.note ? ` · ${e.note}` : ""}</div></td>
                      <td>{Object.entries(e.changes).map(([k, ch]) => <div key={k} className="ri-note">{k.replace(/_minor$|_json$/, "").replace(/_/g, " ")}: {String(ch.from ?? "—")} → {String(ch.to ?? "—")}</div>)}</td>
                      <td><StatusBadge status={e.status} /></td>
                      <td>
                        {e.status === "Pending" && e.requested_by !== user?.username && can("ri.placement.approve") && <>
                          <button type="button" className="btn btn-sm" onClick={() => run("Endorsement approved.", () => api.post(`/api/reinsurance/endorsements/${e.id}/decision`, { approve: true }))}>Approve</button>{" "}
                          <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Endorsement rejected.", () => api.post(`/api/reinsurance/endorsements/${e.id}/decision`, { approve: false, note: window.prompt("Reason (optional)") || undefined }))}>Reject</button></>}
                        {e.status === "Pending" && e.requested_by === user?.username && <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Withdrawn.", () => api.post(`/api/reinsurance/endorsements/${e.id}/withdraw`))}>Withdraw</button>}
                        {v.placement && <a className="btn-secondary btn btn-sm" href={apiUrl(`${base}/endorsements/${e.id}/document?format=pdf`)}>PDF</a>}
                      </td></tr>))}</tbody></table></div>
            </div>
            {can("ri.treaty.edit") && ["Bound", "Active"].includes(t.status) && (
              <form className="card" onSubmit={(e) => {
                e.preventDefault();
                const changes = end.kind === "Alteration" ? { [end.field]: ["commission", "reinstatements"].includes(end.field) ? (() => { try { return JSON.parse(end.value); } catch { return end.value; } })() : end.value } : undefined;
                run("Endorsement requested.", () => api.post(`${base}/endorsements`, { kind: end.kind, effective_date: end.effective_date, description: end.description, changes }));
              }}>
                <h3>Request an endorsement</h3>
                <div className="form-grid">
                  <div className="field"><label htmlFor="e-kind">Kind</label><select id="e-kind" value={end.kind} onChange={(e) => setEnd({ ...end, kind: e.target.value })}><option>Alteration</option><option>Cancellation</option><option>Run-off</option></select></div>
                  <div className="field"><label htmlFor="e-date">Effective date</label><input id="e-date" type="date" value={end.effective_date} onChange={(e) => setEnd({ ...end, effective_date: e.target.value })} /></div>
                  {end.kind === "Alteration" && <>
                    <div className="field"><label htmlFor="e-field">Term</label><select id="e-field" value={end.field} onChange={(e) => setEnd({ ...end, field: e.target.value })}>{(alterable.data?.alterableFields ?? ["mdp"]).map((f) => <option key={f}>{f}</option>)}</select></div>
                    <div className="field"><label htmlFor="e-val">New value</label><input id="e-val" value={end.value} onChange={(e) => setEnd({ ...end, value: e.target.value })} />
                      <small className="muted">Amounts as plain numbers, percentages as basis points (350 = 3.50%), commission and reinstatements as JSON.</small></div></>}
                  <div className="field span-2"><label htmlFor="e-desc">Description</label><input id="e-desc" value={end.description} onChange={(e) => setEnd({ ...end, description: e.target.value })} /></div>
                </div>
                <button className="btn btn-sm" type="submit" disabled={!end.effective_date || !end.description}>Request</button>
              </form>
            )}
          </div>
        )}

        {tab === "versions" && (
          <div className="card"><h2>Version history</h2><p className="ri-note">Every state the terms have been in. Permanent.</p>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Version</th><th>When</th><th>By</th><th>Reason</th></tr></thead>
              <tbody>{v.versions.map((x) => <tr key={x.id}><td>{x.version}</td><td>{x.created_at}</td><td>{x.actor}</td><td>{x.reason || "—"}</td></tr>)}</tbody></table></div></div>
        )}

        {tab === "compare" && (
          <div className="card"><h2>Compared with {yoy.data?.comparison.previous?.ref ?? "last year"}</h2>
            {yoy.isLoading && <p>Loading…</p>}
            {yoy.data && !yoy.data.comparison.previous && <p>This treaty did not renew an earlier one, so there is nothing to compare.</p>}
            {yoy.data?.comparison.previous && (
              <>
                <h3>Terms ({yoy.data.comparison.changedTerms} changed)</h3>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Term</th><th>{yoy.data.comparison.previous.ref}</th><th>{yoy.data.comparison.current.ref}</th></tr></thead>
                  <tbody>{yoy.data.comparison.terms.filter((x) => x.changed).map((x) => <tr key={x.field} style={{ fontWeight: 600 }}><td>{x.label}</td><td>{x.from}</td><td>{x.to}</td></tr>)}
                    {!yoy.data.comparison.changedTerms && <tr><td colSpan={3}>No changes to the terms.</td></tr>}</tbody></table></div>
                {yoy.data.comparison.layers.length > 0 && <>
                  <h3>Layers</h3>
                  <div className="table-wrap"><table className="data-table"><thead><tr><th>Layer</th><th className="ri-num">Limit</th><th className="ri-num">Retention</th><th className="ri-num">Rate</th><th>Status</th></tr></thead>
                    <tbody>{yoy.data.comparison.layers.map((l) => <tr key={l.layer_no}><td>{l.layer_no}</td>
                      {(["limit", "retention", "rate"] as const).map((k) => <td key={k} className="ri-num" style={l[k].changed ? { fontWeight: 600 } : undefined}>{l[k].changed ? `${l[k].from} → ${l[k].to}` : l[k].to}</td>)}<td>{l.status !== "Kept" ? l.status : ""}</td></tr>)}</tbody></table></div></>}
                <h3>Reinsurers</h3>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinsurer</th><th>Layer</th><th className="ri-num">Last year</th><th className="ri-num">This year</th><th>Change</th></tr></thead>
                  <tbody>{!yoy.data.comparison.lineup.length && <tr><td colSpan={5}>No line-up on either year yet.</td></tr>}
                    {yoy.data.comparison.lineup.map((l, i) => <tr key={i}><td>{l.reinsurer}</td><td>{l.layer_no ?? "—"}</td><td className="ri-num">{l.previous_bps != null ? bpsText(l.previous_bps) : "—"}</td><td className="ri-num">{l.current_bps != null ? bpsText(l.current_bps) : "—"}</td><td>{l.change}</td></tr>)}</tbody></table></div>
                <h3>Premium (100%)</h3>
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Layer</th><th className="ri-num">Last year</th><th className="ri-num">This year</th></tr></thead>
                  <tbody>{yoy.data.comparison.premium.map((p, i) => <tr key={i}><td>{p.layer_no ?? "—"}</td><td className="ri-num">{minorText(p.previous_minor, cur)}</td><td className="ri-num">{minorText(p.current_minor, cur)}</td></tr>)}</tbody></table></div>
              </>
            )}
          </div>
        )}

        {tab === "attachments" && <AttachmentsPanel ownerType="treaty" ownerId={t.id} canUpload={can("ri.treaty.edit")} />}
      </div>
    </div>
  );
}

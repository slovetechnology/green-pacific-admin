import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { bpsText, errorText, minorText, percentToBps, type Party, type PlacementView } from "../lib/reinsurance";

type Run = (done: string | null, fn: () => Promise<unknown>) => Promise<void>;
type Post = (path: string, body?: Record<string, unknown>) => Promise<unknown>;

// "0.3066" (percent) -> 3066 parts per million; "" -> undefined.
const rateToPpm = (text: string) => (text.trim() === "" ? undefined : Math.round(Number(text) * 10000));
// "15" (percent) -> 1500 basis points; "" -> undefined; allows zero.
const pctToBpsOrZero = (text: string) => (text.trim() === "" ? undefined : text.trim() === "0" ? 0 : percentToBps(text) ?? NaN);

export function QuotesTab({ v, run, post, canEdit }: { v: PlacementView; run: Run; post: Post; canEdit: boolean }) {
  const cur = v.placement.currency;
  const layered = v.layers.length > 1;
  const [f, setF] = useState({ layer_id: v.layers.length === 1 ? String(v.layers[0].id) : "", reinsurer_party_id: "", kind: "Quote", premium: "", rate: "", line: "", commission: "", brokerage: "", valid_until: "", subjectivities: "", warranties: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const line = percentToBps(f.line);
    const brokerage = pctToBpsOrZero(f.brokerage);
    const commission = pctToBpsOrZero(f.commission);
    if (v.layers.length && !f.layer_id) return setErr("Choose the layer.");
    if (!f.reinsurer_party_id) return setErr("Choose the reinsurer.");
    if (!line) return setErr("Enter the line offered as a percentage, for example 25 or 12.5.");
    if (Number.isNaN(brokerage)) return setErr("Brokerage must be a percentage such as 15.");
    if (Number.isNaN(commission)) return setErr("Commission must be a percentage such as 27.5.");
    setErr(null);
    run("Quote recorded.", () => post("/quotes", {
      reinsurer_party_id: Number(f.reinsurer_party_id), layer_id: f.layer_id ? Number(f.layer_id) : undefined, kind: f.kind, premium: f.premium, rate_ppm: rateToPpm(f.rate),
      offered_line_bps: line, brokerage_bps: brokerage, commission_bps: commission,
      valid_until: f.valid_until || undefined, subjectivities: f.subjectivities || undefined, warranties: f.warranties || undefined,
    })).then(() => setF((x) => ({ ...x, reinsurer_party_id: "", premium: "", rate: "", line: "", commission: "", subjectivities: "", warranties: "" })));
  }
  return (
    <div>
      <div className="card">
        <h2>Quote comparison</h2>
        <p className="ri-note">The latest quote from each reinsurer. The lowest premium is flagged among quotes still valid, so read the conditions before the price.</p>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Reinsurer</th>{layered && <th>Layer</th>}<th>Version</th><th className="ri-num">Premium (100%)</th><th className="ri-num">Rate</th><th className="ri-num">Line</th>{layered && <th className="ri-num">Commission</th>}<th className="ri-num">Brokerage</th><th>Valid until</th><th>Status</th><th>Conditions</th><th /></tr></thead>
          <tbody>
            {!v.comparison.length && <tr><td colSpan={12}>No quotes yet.</td></tr>}
            {v.comparison.map((q) => (
              <tr key={q.id}>
                <td>{q.name}{q.lead && " (lead)"}</td>
                {layered && <td>{v.layers.find((l) => l.id === q.layer_id)?.layer_no ?? "—"}</td>}
                <td>v{q.version}{q.kind === "Counter-quote" ? " counter" : ""}</td>
                <td className="ri-num">{minorText(q.premium_minor, cur)} {q.cheapest && <span className="badge badge-good" title="Lowest valid premium">lowest</span>}</td>
                <td className="ri-num">{q.rate_ppm != null ? `${(q.rate_ppm / 10000).toFixed(4)}%` : "—"}</td>
                <td className="ri-num">{bpsText(q.offered_line_bps)}</td>
                {layered && <td className="ri-num">{q.commission_bps != null ? bpsText(q.commission_bps) : "—"}</td>}
                <td className="ri-num">{q.brokerage_bps != null ? bpsText(q.brokerage_bps) : "—"}</td>
                <td>{q.valid_until || "—"}</td>
                <td><StatusBadge status={q.status} />{q.differs_from_lead && <span className="ri-flag warn" title="Terms differ from the lead's">⚠</span>}</td>
                <td className="ri-note">{[q.subjectivities && `Subject to: ${q.subjectivities}`, q.warranties && `Warranty: ${q.warranties}`].filter(Boolean).join(" · ") || "—"}</td>
                <td>{canEdit && q.status === "Open" && <button type="button" className="btn btn-sm" onClick={() => run("Firm order recorded.", () => post("/firm-orders", { quote_id: q.id }))}>Firm order</button>}</td>
              </tr>
            ))}
          </tbody></table></div>
        <details><summary>All versions ({v.quotes.length})</summary>
          <ul>{v.quotes.map((q) => <li key={q.id}>{q.name} v{q.version} {q.kind}: {minorText(q.premium_minor, cur)} for {bpsText(q.offered_line_bps)} ({q.status}, {q.created_by}, {q.created_at})</li>)}</ul></details>
      </div>
      {canEdit && (
        <form className="card" onSubmit={submit} noValidate>
          <h2>Record a quote or counter-quote</h2>
          {err && <div className="flash flash-error">{err}</div>}
          <div className="form-grid">
            {v.layers.length > 0 && (
              <div className="field"><label htmlFor="q-layer">Layer</label>
                <select id="q-layer" value={f.layer_id} onChange={(e) => setF((x) => ({ ...x, layer_id: e.target.value, reinsurer_party_id: "" }))}><option value="">Choose…</option>
                  {v.layers.map((l) => <option key={l.id} value={l.id}>Layer {l.layer_no}{l.description ? `: ${l.description}` : ""}</option>)}</select></div>
            )}
            <div className="field"><label htmlFor="q-re">Reinsurer</label>
              <select id="q-re" value={f.reinsurer_party_id} onChange={set("reinsurer_party_id")}><option value="">Choose…</option>
                {v.lines.filter((l) => l.status !== "Declined" && !["Firm Order", "Bound", "Signed"].includes(l.status) && (!v.layers.length || String(l.layer_id) === f.layer_id))
                  .map((l) => <option key={`${l.layer_id}-${l.reinsurer_party_id}`} value={l.reinsurer_party_id}>{l.name}</option>)}</select></div>
            <div className="field"><label htmlFor="q-kind">Kind</label>
              <select id="q-kind" value={f.kind} onChange={set("kind")}><option>Quote</option><option>Counter-quote</option></select></div>
            <div className="field"><label htmlFor="q-prem">{v.layers.length ? "Deposit premium for 100% of the layer" : "Premium for 100%"} ({cur})</label><input id="q-prem" inputMode="decimal" value={f.premium} onChange={set("premium")} /></div>
            <div className="field"><label htmlFor="q-rate">Rate (%)</label><input id="q-rate" inputMode="decimal" value={f.rate} onChange={set("rate")} placeholder="e.g. 0.3066" /></div>
            <div className="field"><label htmlFor="q-line">Line offered (%)</label><input id="q-line" inputMode="decimal" value={f.line} onChange={set("line")} /></div>
            {v.subjectType === "Treaty" && <div className="field"><label htmlFor="q-com">Ceding commission (%)</label><input id="q-com" inputMode="decimal" value={f.commission} onChange={set("commission")} /></div>}
            <div className="field"><label htmlFor="q-brk">Brokerage (%)</label><input id="q-brk" inputMode="decimal" value={f.brokerage} onChange={set("brokerage")} /></div>
            <div className="field"><label htmlFor="q-valid">Valid until</label><input id="q-valid" type="date" value={f.valid_until} onChange={set("valid_until")} /></div>
            <div className="field span-2"><label htmlFor="q-subj">Subjectivities</label><input id="q-subj" value={f.subjectivities} onChange={set("subjectivities")} /></div>
            <div className="field span-2"><label htmlFor="q-warr">Warranties</label><input id="q-warr" value={f.warranties} onChange={set("warranties")} /></div>
          </div>
          <button className="btn" type="submit">Record</button>
        </form>
      )}
    </div>
  );
}

export function ComplianceTab({ v, run, base, canEdit }: { v: PlacementView; run: Run; base: string; canEdit: boolean }) {
  const [f, setF] = useState({ evidence_type: "Local Decline", local_party_id: "", description: "", offered: "", evidence_date: "", document_ref: "" });
  const [naicom, setNaicom] = useState({ reference: "", notes: "" });
  const locals = useQuery({ queryKey: ["ri", "local-reinsurers"], queryFn: () => api.get<{ rows: Party[] }>("/api/reinsurance/parties?type=Reinsurer&limit=200") });
  const rules = useQuery({ queryKey: ["ri", "rules-active"], queryFn: () => api.get<{ rules: { id: number; code: string; title: string; enforcement: string; verified: number; verify_note: string; source_note: string | null }[] }>("/api/reinsurance/regulatory-rules/active") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const offshore = v.checks.offshore;
  const next: Record<string, string[]> = { "Not Submitted": ["Submitted", "Not Required"], Submitted: ["Approved", "Rejected"], Rejected: ["Submitted"], Approved: [], "Not Required": ["Not Submitted"] };
  return (
    <div>
      <div className="card">
        <h2>Regulatory placement hierarchy</h2>
        <div className="flash flash-warning">Template rules. Verify against current NIIRA 2025 and NAICOM circulars before relying on them.</div>
        <p>{offshore ? "This placement has an offshore or Lloyd's reinsurer, so local capacity must be shown to be exhausted and NAICOM approval obtained, as the rules below require." : "No offshore reinsurer is on the line-up, so the offshore rules don't apply yet."}</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Rule</th><th>Enforcement</th><th>Verified</th><th>Source</th></tr></thead>
          <tbody>{(rules.data?.rules ?? []).map((r) => <tr key={r.id}><td><strong>{r.code}</strong><div className="ri-note">{r.title}</div></td><td>{r.enforcement}</td>
            <td>{r.verified ? "Yes" : <span title={r.verify_note}>Not yet</span>}</td><td className="ri-note">{r.source_note || "—"}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <h2>Evidence that local capacity was exhausted</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Local market</th><th className="ri-num">Line offered</th><th>Detail</th><th>Document</th></tr></thead>
          <tbody>{!v.evidence.length && <tr><td colSpan={6}>Nothing recorded.</td></tr>}
            {v.evidence.map((e) => <tr key={e.id}><td>{e.evidence_date}</td><td>{e.evidence_type}</td><td>{e.local_party_name || "—"}</td><td className="ri-num">{e.offered_line_bps != null ? bpsText(e.offered_line_bps) : "—"}</td><td>{e.description}</td><td>{e.document_ref || "—"}</td></tr>)}</tbody></table></div>
        {canEdit && (
          <form onSubmit={(e) => { e.preventDefault(); const offered = f.offered ? percentToBps(f.offered) : undefined; if (f.offered && !offered) return;
            run("Evidence recorded.", () => api.post(`${base}/evidence`, { evidence_type: f.evidence_type, local_party_id: f.local_party_id ? Number(f.local_party_id) : undefined, description: f.description, offered_line_bps: offered, evidence_date: f.evidence_date || undefined, document_ref: f.document_ref || undefined })).then(() => setF((x) => ({ ...x, description: "", offered: "", document_ref: "" }))); }}>
            <div className="form-grid">
              <div className="field"><label htmlFor="e-type">Type</label><select id="e-type" value={f.evidence_type} onChange={set("evidence_type")}>
                {["Local Market Approach", "Local Decline", "Local Capacity Offered", "Pool Cleared", "NAICOM Correspondence", "Other"].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="e-party">Local market</label><select id="e-party" value={f.local_party_id} onChange={set("local_party_id")}><option value="">—</option>
                {(locals.data?.rows ?? []).filter((r) => r.market_category === "Local").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
              <div className="field"><label htmlFor="e-off">Line offered (%)</label><input id="e-off" value={f.offered} onChange={set("offered")} /></div>
              <div className="field"><label htmlFor="e-date">Date</label><input id="e-date" type="date" value={f.evidence_date} onChange={set("evidence_date")} /></div>
              <div className="field span-2"><label htmlFor="e-desc">What happened</label><input id="e-desc" value={f.description} onChange={set("description")} /></div>
              <div className="field"><label htmlFor="e-doc">Document reference</label><input id="e-doc" value={f.document_ref} onChange={set("document_ref")} /></div>
            </div>
            <button className="btn btn-sm" type="submit" disabled={!f.description}>Add evidence</button>
          </form>
        )}
      </div>
      <div className="card">
        <h2>NAICOM approval for offshore placement</h2>
        <p>Status: <StatusBadge status={v.offshoreApproval.status} /> {v.offshoreApproval.reference && <>Reference <strong>{v.offshoreApproval.reference}</strong></>}</p>
        {canEdit && (next[v.offshoreApproval.status] ?? []).length > 0 && (
          <div className="ri-inline">
            <div className="field"><label htmlFor="n-ref">NAICOM reference</label><input id="n-ref" value={naicom.reference} onChange={(e) => setNaicom((n) => ({ ...n, reference: e.target.value }))} /></div>
            <div className="field"><label htmlFor="n-notes">Notes</label><input id="n-notes" value={naicom.notes} onChange={(e) => setNaicom((n) => ({ ...n, notes: e.target.value }))} /></div>
            {next[v.offshoreApproval.status].map((s) => (
              <button key={s} type="button" className="btn-secondary btn btn-sm" onClick={() => run(`NAICOM approval: ${s}.`, () => api.put(`${base}/offshore-approval`, { status: s, reference: naicom.reference || undefined, notes: naicom.notes || undefined }))}>Mark {s}</button>
            ))}
          </div>
        )}
        <p><a className="btn-secondary btn btn-sm" href={apiUrl(`${base}/documents/justification?format=pdf`)}>Justification pack (PDF)</a></p>
      </div>
    </div>
  );
}

// Fetches the file with the session cookie and saves it; a refusal (for example a
// certificate asked for too early) comes back as JSON and is shown instead.
async function download(url: string, setError: (e: string | null) => void, reload: () => void) {
  setError(null);
  const res = await fetch(apiUrl(url), { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return setError(body?.error || res.statusText);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "document";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  reload();
}

export function DocumentsTab({ v, base }: { v: PlacementView; base: string }) {
  const [error, setError] = useState<string | null>(null);
  const meta = useQuery({ queryKey: ["ri", "placement-meta"], queryFn: () => api.get<{ documents: { key: string; label: string; applies: string | null }[] }>("/api/reinsurance/placement-meta") });
  const queryClient = useQueryClient();
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["ri", "placement"] }); };
  return (
    <div className="card">
      <h2>Documents</h2>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Document</th><th /></tr></thead>
        <tbody>{(meta.data?.documents ?? []).filter((d) => (d.applies ?? v.subjectType) === v.subjectType && d.key !== "endorsement").map((d) => (
          <tr key={d.key}><td>{d.label}</td><td>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => download(`${base}/documents/${d.key}?format=pdf`, setError, refresh)}>PDF</button>{" "}
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => download(`${base}/documents/${d.key}?format=docx`, setError, refresh)}>Word</button></td></tr>))}</tbody></table></div>
      <p className="ri-note">Cover notes need the placement to be bound; certificates and treaty contracts need signed lines. Treaty endorsements are issued from the treaty page. Everything generated is logged below with a hash of the file.</p>
      <h3>Generated so far</h3>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>When</th><th>Document</th><th>Format</th><th>Placement status</th><th>By</th></tr></thead>
        <tbody>{!v.documents.length && <tr><td colSpan={5}>Nothing generated yet.</td></tr>}
          {v.documents.map((d) => <tr key={d.id}><td>{d.created_at}</td><td>{d.doc_type}</td><td>{d.format}</td><td>{d.placement_status}</td><td>{d.generated_by}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export function CorrespondenceTab({ v, run, base, canEdit }: { v: PlacementView; run: Run; base: string; canEdit: boolean }) {
  const [note, setNote] = useState({ subject: "", body: "", channel: "Phone", direction: "Inbound", party_id: "" });
  return (
    <div>
      <div className="card">
        <h2>Correspondence log</h2>
        <p className="ri-note">Emails are drafted here and logged; nothing is sent from the system. Copy a draft into your mail client, then mark it sent. Acknowledgements are recorded by hand.</p>
        {canEdit && (
          <div className="ri-inline">
            <button type="button" className="btn btn-sm" onClick={() => run("Slip emails drafted.", () => api.post(`${base}/correspondence/drafts`, { kind: "slip" }))}>Draft slip emails to all reinsurers</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Quote requests drafted.", () => api.post(`${base}/correspondence/drafts`, { kind: "quote-request" }))}>Draft quote requests</button>
          </div>
        )}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>When</th><th>With</th><th>Channel</th><th>Subject</th><th>Status</th><th /></tr></thead>
          <tbody>{!v.correspondence.length && <tr><td colSpan={6}>Nothing logged.</td></tr>}
            {v.correspondence.map((c) => (
              <tr key={c.id}><td>{c.created_at}</td><td>{c.party_name || "—"}<div className="ri-note">{c.to_address || (c.direction === "Outbound" ? "no email on file" : "")}</div></td>
                <td>{c.direction} {c.channel}</td>
                <td>{c.subject}{c.body && <details><summary>Read</summary><pre style={{ whiteSpace: "pre-wrap" }}>{c.body}</pre></details>}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>{canEdit && c.status === "Draft" && <><button type="button" className="btn btn-sm" onClick={() => run("Marked sent.", () => api.post(`/api/reinsurance/correspondence/${c.id}/sent`))}>Mark sent</button>{" "}
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Draft cancelled.", () => api.post(`/api/reinsurance/correspondence/${c.id}/cancelled`))}>Cancel</button></>}
                  {canEdit && c.status === "Sent" && <button type="button" className="btn btn-sm" onClick={() => run("Acknowledged.", () => api.post(`/api/reinsurance/correspondence/${c.id}/acknowledged`, { note: window.prompt("Note (optional)") || undefined }))}>Acknowledged</button>}</td></tr>))}</tbody></table></div>
      </div>
      {canEdit && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); run("Logged.", () => api.post(`${base}/correspondence`, { ...note, party_id: note.party_id ? Number(note.party_id) : undefined })).then(() => setNote((n) => ({ ...n, subject: "", body: "" }))); }}>
          <h2>Log a call, meeting or note</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="c-ch">Channel</label><select id="c-ch" value={note.channel} onChange={(e) => setNote((n) => ({ ...n, channel: e.target.value }))}>{["Phone", "Meeting", "Email", "Note"].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="c-dir">Direction</label><select id="c-dir" value={note.direction} onChange={(e) => setNote((n) => ({ ...n, direction: e.target.value }))}><option>Inbound</option><option>Outbound</option></select></div>
            <div className="field"><label htmlFor="c-party">With</label><select id="c-party" value={note.party_id} onChange={(e) => setNote((n) => ({ ...n, party_id: e.target.value }))}><option value="">—</option>
              {v.lines.map((l) => <option key={l.reinsurer_party_id} value={l.reinsurer_party_id}>{l.name}</option>)}</select></div>
            <div className="field span-2"><label htmlFor="c-sub">Subject</label><input id="c-sub" value={note.subject} onChange={(e) => setNote((n) => ({ ...n, subject: e.target.value }))} /></div>
            <div className="field span-2"><label htmlFor="c-body">Detail</label><textarea id="c-body" rows={3} value={note.body} onChange={(e) => setNote((n) => ({ ...n, body: e.target.value }))} /></div>
          </div>
          <button className="btn btn-sm" type="submit" disabled={!note.subject}>Add to log</button>
        </form>
      )}
    </div>
  );
}

export function ClausesTab({ v, run, base, canEdit }: { v: PlacementView; run: Run; base: string; canEdit: boolean }) {
  const available = useQuery({
    queryKey: ["ri", "clauses", v.placement.id, v.placement.version],
    queryFn: () => api.get<{ clauses: { id: number; code: string; title: string; clause_type: string; category: string | null; is_mandatory: boolean; attached: boolean }[] }>(`${base}/clauses/available`),
  });
  return (
    <div className="card">
      <h2>Clauses</h2>
      <p className="ri-note">From the Clause Library: entries with product "Reinsurance" for this class. Add reinsurance clauses (hours clause, sunset, cut-through, access to records, intermediary and so on) in the library with that product and a category in the risk type field.</p>
      {available.error && <div className="flash flash-error">{errorText(available.error)}</div>}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Clause</th><th>Category</th><th /></tr></thead>
        <tbody>{!available.data?.clauses.length && <tr><td colSpan={4}>No reinsurance clauses in the library for this class.</td></tr>}
          {(available.data?.clauses ?? []).map((c) => (
            <tr key={c.id}><td>{c.code}</td><td>{c.title}{c.is_mandatory && <span className="badge badge-warning"> mandatory</span>}</td><td>{c.category || "—"}</td>
              <td>{canEdit && (c.attached
                ? <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Clause removed.", () => api.delete(`${base}/clauses/${c.id}`))}>Remove</button>
                : <button type="button" className="btn btn-sm" onClick={() => run("Clause attached.", () => api.post(`${base}/clauses`, { clause_id: c.id }))}>Attach</button>)}
                {!canEdit && c.attached && "Attached"}</td></tr>))}</tbody></table></div>
    </div>
  );
}

export function HistoryTab({ v }: { v: PlacementView }) {
  return (
    <div>
      <div className="card"><h2>Status history</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>When</th><th>From</th><th>To</th><th>By</th><th>Reason</th></tr></thead>
          <tbody>{v.history.map((h) => <tr key={h.id}><td>{h.created_at}</td><td>{h.from_status || "—"}</td><td>{h.to_status}</td><td>{h.actor}</td><td>{h.reason || "—"}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>Signed-line log</h2><p className="ri-note">Permanent. A line is recorded here when signing is approved and can't be edited afterwards.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>When</th><th>Reinsurer</th><th className="ri-num">Written</th><th className="ri-num">Signed</th><th>Requested by</th><th>Approved by</th></tr></thead>
          <tbody>{!v.signedLog.length && <tr><td colSpan={6}>Not signed yet.</td></tr>}
            {v.signedLog.map((s) => <tr key={s.id}><td>{s.created_at}</td><td>{v.lines.find((l) => l.reinsurer_party_id === s.reinsurer_party_id)?.name ?? s.reinsurer_party_id}</td>
              <td className="ri-num">{bpsText(s.written_bps)}</td><td className="ri-num">{bpsText(s.signed_bps)}</td><td>{s.actor}</td><td>{s.approved_by}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}

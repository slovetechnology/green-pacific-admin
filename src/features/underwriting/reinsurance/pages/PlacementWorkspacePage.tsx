import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { useAuth } from "@/features/platform/auth/AuthContext";
import {
  PIPELINE, bpsText, errorText, minorDecimal, minorText, percentToBps, useReinsuranceStatus,
  type LayerReconcile, type Party, type PlacementView, type Reconcile,
} from "../lib/reinsurance";
import { AttachmentsPanel } from "../components/AttachmentsPanel";
import { PlacementBillingTab } from "./BillingPages";
import { ComplianceTab, CorrespondenceTab, ClausesTab, DocumentsTab, HistoryTab, QuotesTab } from "../components/WorkspaceTabs";
import "@/shared/styles/executive.css";
import "@/shared/styles/reinsurance.css";

interface Draft { reinsurer_party_id: number; layer_id: number | null; name: string; role: "Lead" | "Follower"; written: string; status: string; locked: boolean }

function TotalBar({ label, rec, note }: { label: string; rec: Reconcile; note?: string }) {
  const width = Math.min(100, (rec.totalBps / Math.max(rec.targetBps, 1)) * 100);
  const cls = rec.status === "Reconciled" ? "reconciled" : rec.status === "Over-placed" ? "over" : "";
  return (
    <div className={`ri-total ${cls}`} role="status" aria-label={`${label} ${rec.status}`}>
      <div className="ri-total-bar"><div className="ri-total-fill" style={{ width: `${width}%` }} /></div>
      <div className="ri-total-label">
        <span>{label}: <strong>{bpsText(rec.totalBps)}</strong> of {bpsText(rec.targetBps)}</span>
        <span>{rec.status}{rec.diffBps ? ` (${rec.diffBps > 0 ? "+" : ""}${(rec.diffBps / 100).toFixed(2)}%)` : ""}</span>
      </div>
      {note && <div className="ri-note">{note}</div>}
    </div>
  );
}

const keyOf = (layerId: number | null) => layerId ?? 0;
const draftBpsOf = (d: Draft) => percentToBps(d.written);

// The single screen for one placement, a facultative risk or a treaty with its
// layers: the risk or terms, the line-up with a running total against the order
// for each layer, the quote comparison and the status timeline, with the
// regulatory, document and correspondence work in tabs below.
export function PlacementWorkspacePage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can } = useReinsuranceStatus();
  const [tab, setTab] = useState("quotes");
  const [flash, setFlash] = useState<{ kind: "error" | "success" | "warning"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [addId, setAddId] = useState<Record<number, string>>({});
  const [editFac, setEditFac] = useState(false);
  const [facForm, setFacForm] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ["ri", "placement", id], queryFn: () => api.get<PlacementView>(`/api/reinsurance/placements/${id}`), enabled: Boolean(id) });
  const reinsurers = useQuery({ queryKey: ["ri", "reinsurers"], queryFn: () => api.get<{ rows: Party[] }>("/api/reinsurance/parties?type=Reinsurer&limit=200") });
  const v = q.data;
  const version = v?.placement.version;

  // Reset the editable line-up whenever the server's version changes.
  useEffect(() => {
    if (!v) return;
    setDrafts(v.lines.filter((l) => l.status !== "Declined").map((l) => ({
      reinsurer_party_id: l.reinsurer_party_id, layer_id: l.layer_id, name: l.name, role: l.role, written: l.written_bps ? (l.written_bps / 100).toFixed(2) : "",
      status: l.status, locked: !["Invited", "Quoted"].includes(l.status),
    })));
    if (v.fac) {
      setFacForm({
        sum_insured: minorDecimal(v.fac.sum_insured_minor), cedant_retention: minorDecimal(v.fac.cedant_retention_minor), pml: minorDecimal(v.fac.pml_minor),
        mfl: minorDecimal(v.fac.mfl_minor), treaty_capacity_used: minorDecimal(v.fac.treaty_capacity_used_minor), required_fac: minorDecimal(v.fac.required_fac_minor),
        location: v.fac.location || "", risk_description: v.fac.risk_description || "", class_of_business: v.fac.class_of_business || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, id]);

  // Runs a change, reloads the placement, and shows what happened. A stale-version
  // conflict is shown as-is and the screen reloads so the person starts again.
  async function run(done: string | null, fn: () => Promise<unknown>) {
    setFlash(null);
    try {
      const res = (await fn()) as { slipError?: string } | undefined;
      if (res?.slipError) setFlash({ kind: "warning", text: `Saved, but the broking slip could not be refreshed: ${res.slipError}` });
      else if (done) setFlash({ kind: "success", text: done });
    } catch (e) {
      setFlash({ kind: "error", text: errorText(e) });
    }
    await queryClient.invalidateQueries({ queryKey: ["ri"] });
  }
  const base = `/api/reinsurance/placements/${id}`;
  const post = (path: string, body: Record<string, unknown> = {}) => api.post(`${base}${path}`, { expected_version: version, ...body });

  if (q.isLoading) return <p>Loading…</p>;
  if (q.error || !v) return <div className="flash flash-error">{errorText(q.error) || "Placement not found."}</div>;

  const { placement: p, fac, treaty, capacity: cap } = v;
  const cur = p.currency;
  const isTreaty = v.subjectType === "Treaty";
  const preBind = ["Enquiry", "Submission Prepared", "Marketed", "Quotes In", "Firm Order"].includes(p.status);
  const canEdit = can("ri.placement.edit") && preBind;
  const alerts = v.bindChecks ?? v.checks;
  const idx = PIPELINE.indexOf(p.status);
  const ended = p.status === "Lapsed" || p.status === "Declined";
  const mine = user?.username;
  const title = isTreaty ? treaty!.name : fac!.original_insured || "Standalone risk";

  const dirty = JSON.stringify(drafts.map((d) => [d.reinsurer_party_id, d.layer_id, d.role, d.written])) !== JSON.stringify(
    v.lines.filter((l) => l.status !== "Declined").map((l) => [l.reinsurer_party_id, l.layer_id, l.role, l.written_bps ? (l.written_bps / 100).toFixed(2) : ""]));

  function saveLines() {
    const bad = drafts.find((d) => !d.locked && d.written !== "" && draftBpsOf(d) === null);
    if (bad) return setFlash({ kind: "error", text: `${bad.name}: enter a line between 0.01 and 100 with at most 2 decimals.` });
    // A firm line keeps its firm-order share; send it unchanged.
    const lines = drafts.map((d) => ({
      reinsurer_party_id: d.reinsurer_party_id, layer_id: d.layer_id, role: d.role,
      written_bps: d.locked ? v!.lines.find((x) => x.reinsurer_party_id === d.reinsurer_party_id && keyOf(x.layer_id) === keyOf(d.layer_id))!.written_bps : draftBpsOf(d) ?? 0,
    }));
    return run("Line-up saved.", () => api.put(`${base}/lines`, { lines, expected_version: version }));
  }

  function changeStatus(to: string) {
    let reason: string | null = null;
    if (to === "Declined" || to === "Lapsed") {
      reason = window.prompt(`Why is this placement ${to.toLowerCase()}?`);
      if (!reason) return;
    }
    run(`Moved to ${to}.`, () => post("/transition", { status: to, reason }));
  }

  const tabs: TabDef[] = [
    { id: "quotes", label: "Quotes", count: v.comparison.length },
    { id: "compliance", label: "Regulatory", count: v.evidence.length },
    { id: "approvals", label: "Approvals", count: v.approvals.filter((a) => a.status === "Pending").length || undefined },
    { id: "documents", label: "Documents" },
    { id: "billing", label: "Billing" },
    { id: "attachments", label: "Attachments" },
    { id: "correspondence", label: "Correspondence", count: v.correspondence.length },
    { id: "clauses", label: "Clauses", count: v.clauses.length },
    { id: "history", label: "History" },
  ];
  const approvalPermission = (action: string) => (action === "Bind" ? "ri.placement.approve" : "ri.sign.approve");
  const requestable = p.status === "Firm Order" ? "Bind" : p.status === "Bound" ? "Sign" : null;
  const pending = v.approvals.find((a) => a.status === "Pending");
  const kv = (pairs: [string, string][]) => (
    <div className="detail-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>{pairs.map(([k, val]) => <div key={k}><div className="k">{k}</div><div className="v">{val}</div></div>)}</div>
  );

  const groupTitle = (g: LayerReconcile) => (g.layer_no ? `Layer ${g.layer_no}${g.description ? `: ${g.description}` : ""}${g.limit_minor ? ` (${minorText(g.limit_minor, cur)} xs ${minorText(g.retention_minor ?? 0, cur)})` : ""}` : null);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/reinsurance/placements">Reinsurance</Link> · {isTreaty ? `${treaty!.treaty_type} treaty` : `${fac!.fac_type} fac`} · {v.cedant.name}</p>
          <h1>{p.placement_ref} <StatusBadge status={p.status} /></h1>
          <p className="ri-note">
            {isTreaty ? <>{treaty!.treaty_ref} · <Link to={`/reinsurance/treaties/${treaty!.id}`}>{title}</Link></> : <>{fac!.fac_ref} · {title}{v.transaction ? ` · policy ${v.transaction.policy_no || v.transaction.id}` : ""}</>}
            {" "}· version {p.version}
            {v.slip && <> · slip <Link to={`/broking-slips/${v.slip.id}`}>{v.slip.slip_number}</Link> ({v.slip.status})</>}</p>
        </div>
        <div className="page-header-actions">
          {can("ri.placement.edit") && <button type="button" className="btn-secondary btn" onClick={() => run("Slip refreshed.", () => api.post(`${base}/slip/sync`))}>Refresh slip</button>}
          <button type="button" className="btn-secondary btn" onClick={() => queryClient.invalidateQueries({ queryKey: ["ri"] })}>Reload</button>
        </div>
      </div>

      <div className="ri-timeline" aria-label="Placement status">
        {PIPELINE.map((s, i) => <span key={s} className={`ri-step${i < idx ? " done" : ""}${i === idx ? " current" : ""}`}>{s}</span>)}
        {ended && <span className="ri-step ended current">{p.status}</span>}
      </div>

      {flash && <div className={`flash flash-${flash.kind}`}>{flash.text}</div>}
      {(alerts.blockers.length > 0 || alerts.warnings.length > 0) && (
        <div className="ri-alerts">
          {alerts.blockers.length > 0 && <div className="flash flash-error">{v.bindChecks ? "Blocking binding" : "Will block binding"}:<ul>{alerts.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          {alerts.warnings.length > 0 && <div className="flash flash-warning">Warnings:<ul>{alerts.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
        </div>
      )}

      <div className="card">
        <div className="ri-inline">
          {can("ri.placement.edit") && v.nextStatuses.map((s) => (
            <button key={s} type="button" className={["Declined", "Lapsed"].includes(s) ? "btn-secondary btn" : "btn"} onClick={() => changeStatus(s)}>
              {["Declined", "Lapsed"].includes(s) ? `Mark ${s.toLowerCase()}` : `Move to ${s}`}
            </button>
          ))}
          {requestable && can("ri.placement.bind") && !pending && (
            <button type="button" className="btn" onClick={() => run(`${requestable} approval requested.`, () => api.post(`${base}/approvals`, { action: requestable }))}>
              Request {requestable === "Bind" ? "binding" : "signing"} approval
            </button>
          )}
          {pending && (
            <span>
              <strong>{pending.action}</strong> request from {pending.requested_by} is waiting.{" "}
              {pending.requested_by === mine && can("ri.placement.bind") && (
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Request withdrawn.", () => api.post(`/api/reinsurance/approvals/${pending.id}/cancel`))}>Withdraw</button>
              )}
              {pending.requested_by !== mine && can(approvalPermission(pending.action)) && (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => run(`${pending.action} approved.`, () => api.post(`/api/reinsurance/approvals/${pending.id}/decision`, { approve: true }))}>Approve</button>{" "}
                  <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Request rejected.", () => api.post(`/api/reinsurance/approvals/${pending.id}/decision`, { approve: false, note: window.prompt("Reason (optional)") || undefined }))}>Reject</button>
                </>
              )}
              {pending.requested_by === mine && !can("ri.placement.bind") && <span className="muted">Needs another person to approve.</span>}
            </span>
          )}
          {!v.nextStatuses.length && !requestable && !pending && <span className="muted">No further actions from {p.status}.</span>}
        </div>
      </div>

      <div className="ri-columns">
        <div className="card">
          {isTreaty && treaty ? (
            <>
              <h2>Treaty</h2>
              {kv([
                ["Reference", treaty.treaty_ref], ["Status", treaty.status], ["Type", treaty.treaty_type], ["Basis", treaty.basis],
                ["Period", `${treaty.period_start} to ${treaty.period_end}`], ["Class", treaty.class_of_business || "—"],
                ["Retention", minorText(treaty.retention_minor, cur)], ["Limit", minorText(treaty.limit_minor, cur)],
                ["Cession", treaty.cession_bps != null ? bpsText(treaty.cession_bps) : "—"], ["Ceding commission", treaty.ceding_commission_bps != null ? bpsText(treaty.ceding_commission_bps) : "—"],
                ["Brokerage", treaty.brokerage_bps != null ? `${bpsText(treaty.brokerage_bps)}${treaty.brokerage_deducted_from ? `, from the ${treaty.brokerage_deducted_from.toLowerCase()}` : ""}` : "—"],
                ["Minimum and deposit premium", minorText(treaty.mdp_minor, cur)],
              ])}
              {v.layers.length > 0 && <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0 }}>{v.layers.map((l) => <li key={l.id}>Layer {l.layer_no}: {minorText(l.limit_minor, cur)} xs {minorText(l.retention_minor ?? 0, cur)}</li>)}</ul>}
              <p className="ri-note">Treaty terms, commission, reinstatements and layers are edited on the treaty. They are locked once the treaty is bound; after that use an endorsement.</p>
              <div className="ri-inline"><Link className="btn-secondary btn btn-sm" to={`/reinsurance/treaties/${treaty.id}`}>Open treaty</Link></div>
            </>
          ) : fac && cap && (
            <>
              <h2>Risk and capacity</h2>
              {!editFac ? (
                <>
                  {kv([
                    ["Sum insured", minorText(fac.sum_insured_minor, cur)], ["Retention", minorText(fac.cedant_retention_minor, cur)],
                    ["PML", minorText(fac.pml_minor, cur)], ["MFL", minorText(fac.mfl_minor, cur)],
                    ["Class", fac.class_of_business || "—"], ["Period", `${fac.period_start || "—"} to ${fac.period_end || "—"}`],
                  ])}
                  <p>{fac.risk_description || ""}</p>
                  <h3>Treaty versus fac</h3>
                  {kv([
                    ["Treaty", cap.treaty ? `${cap.treaty.ref} (${cap.treaty.type})` : "None found"], ["Treaty available", minorText(cap.treatyAvailableMinor, cur)],
                    ["Treaty takes", minorText(cap.treatyTakesMinor, cur)], ["Fac required", minorText(fac.required_fac_minor, cur)],
                    ["Placed so far", `${minorText(cap.placedMinor, cur)} (${bpsText(cap.placedBps)})`], ["Still to place", minorText(cap.facRemainingMinor, cur)],
                  ])}
                  {cap.overCeded && <div className="flash flash-error">Over-cession of {minorText(cap.overCededMinor, cur)}: the fac required is more than the exposure left after retention and treaty.</div>}
                  {canEdit && <div className="ri-inline">
                    <button type="button" className="btn-secondary btn btn-sm" onClick={() => setEditFac(true)}>Edit risk</button>
                    <button type="button" className="btn-secondary btn btn-sm" onClick={() => run("Fac required recalculated.", () => post("/fac/recalculate"))}>Recalculate fac required</button>
                  </div>}
                </>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); run("Risk updated.", () => api.put(`${base}/fac`, { ...facForm, expected_version: version }).then(() => setEditFac(false))); }}>
                  <div className="form-grid">
                    {([["sum_insured", "Sum insured"], ["cedant_retention", "Retention"], ["pml", "PML"], ["mfl", "MFL"], ["treaty_capacity_used", "Treaty capacity used"], ["required_fac", "Fac required"], ["class_of_business", "Class"], ["location", "Location"]] as [string, string][]).map(([k, label]) => (
                      <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>
                        <input id={`f-${k}`} value={facForm[k] ?? ""} onChange={(e) => setFacForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
                    ))}
                    <div className="field span-2"><label htmlFor="f-risk">Risk description</label>
                      <textarea id="f-risk" rows={3} value={facForm.risk_description ?? ""} onChange={(e) => setFacForm((f) => ({ ...f, risk_description: e.target.value }))} /></div>
                  </div>
                  <button className="btn btn-sm" type="submit">Save</button>{" "}
                  <button className="btn-secondary btn btn-sm" type="button" onClick={() => setEditFac(false)}>Cancel</button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="card ri-lines">
          <h2>Line-up</h2>
          {v.reconcileByLayer.map((g) => {
            const inGroup = drafts.filter((d) => keyOf(d.layer_id) === keyOf(g.layer_id));
            const total = inGroup.reduce((s, d) => s + (draftBpsOf(d) ?? 0), 0);
            const rec: Reconcile = { totalBps: total, targetBps: p.order_bps, diffBps: total - p.order_bps, status: total === p.order_bps ? "Reconciled" : total < p.order_bps ? "Under-placed" : "Over-placed" };
            const gk = keyOf(g.layer_id);
            return (
              <div key={gk}>
                {groupTitle(g) && <h3>{groupTitle(g)}</h3>}
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Reinsurer</th><th>Role</th><th>Status</th><th className="ri-num">Written %</th><th className="ri-num">Signed %</th><th /></tr></thead>
                    <tbody>
                      {!inGroup.length && <tr><td colSpan={6}>No reinsurers yet. Add the markets you are approaching.</td></tr>}
                      {inGroup.map((d) => {
                        const i = drafts.indexOf(d);
                        const line = v.lines.find((l) => l.reinsurer_party_id === d.reinsurer_party_id && keyOf(l.layer_id) === gk);
                        return (
                          <tr key={`${gk}-${d.reinsurer_party_id}`}>
                            <td>
                              <Link to={`/reinsurance/parties/${d.reinsurer_party_id}`}>{d.name}</Link>
                              {line?.flags.blockers.map((b) => <span key={b} className="ri-flag block" title={b} aria-label={b}>⛔</span>)}
                              {line?.flags.warnings.map((w) => <span key={w} className="ri-flag warn" title={w} aria-label={w}>⚠</span>)}
                              <div className="ri-note">{line?.market_category || "—"}{line?.country ? `, ${line.country}` : ""} · {line?.ratings.length ? line.ratings.map((r) => `${r.agency} ${r.rating}`).join(", ") : "not rated"}</div>
                            </td>
                            <td>{canEdit ? (
                              <select aria-label={`${d.name} role`} value={d.role} onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, role: e.target.value as "Lead" | "Follower" } : x)))}>
                                <option>Lead</option><option>Follower</option></select>) : d.role}</td>
                            <td><StatusBadge status={d.status} /></td>
                            <td className="ri-num">{canEdit && !d.locked ? (
                              <input className="ri-pct" inputMode="decimal" aria-label={`${d.name} written line %`} value={d.written}
                                onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, written: e.target.value } : x)))} />
                            ) : bpsText(line?.written_bps)}</td>
                            <td className="ri-num">{line?.status === "Signed" ? bpsText(line.signed_bps) : "—"}</td>
                            <td>{canEdit && ["Invited", "Quoted"].includes(d.status) && (
                              <button type="button" className="btn-secondary btn btn-sm" onClick={() => {
                                const reason = window.prompt(`Why has ${d.name} declined${g.layer_no ? ` layer ${g.layer_no}` : ""}?`);
                                if (reason) run("Reinsurer marked as declined.", () => post(`/lines/${d.reinsurer_party_id}/decline`, { reason, layer_id: g.layer_id }));
                              }}>Declined</button>)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <TotalBar label="Written (this table)" rec={rec} note={rec.status === "Over-placed" ? "Over-subscribed lines are signed down pro-rata to the order at signing." : undefined} />
                <TotalBar label="Firm orders" rec={g.written} />
                {g.signed.totalBps > 0 && <TotalBar label="Signed" rec={g.signed} />}
                {canEdit && (
                  <div className="ri-inline">
                    <div className="field"><label htmlFor={`add-re-${gk}`}>Add reinsurer{g.layer_no ? ` to layer ${g.layer_no}` : ""}</label>
                      <select id={`add-re-${gk}`} value={addId[gk] ?? ""} onChange={(e) => setAddId((a) => ({ ...a, [gk]: e.target.value }))}>
                        <option value="">Choose…</option>
                        {(reinsurers.data?.rows ?? []).filter((r) => !inGroup.some((d) => d.reinsurer_party_id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}{r.market_category ? ` (${r.market_category})` : ""}</option>)}
                      </select></div>
                    <button type="button" className="btn-secondary btn" disabled={!addId[gk]} onClick={() => {
                      const r = reinsurers.data?.rows.find((x) => x.id === Number(addId[gk])); if (!r) return;
                      setDrafts((all) => [...all, { reinsurer_party_id: r.id, layer_id: g.layer_id, name: r.name, role: inGroup.length ? "Follower" : "Lead", written: "", status: "Invited", locked: false }]);
                      setAddId((a) => ({ ...a, [gk]: "" }));
                    }}>Add</button>
                  </div>
                )}
              </div>
            );
          })}
          {canEdit && (
            <div className="ri-inline">
              <button type="button" className="btn" disabled={!dirty} onClick={saveLines}>Save line-up</button>
              {dirty && <span className="ri-note">Unsaved changes</span>}
            </div>
          )}
          {v.premium && (
            <>
              <h3>Premium {v.premium.signed ? "(signed)" : "(if signed as written)"}</h3>
              {v.premium.layers.map((ls) => (
                <div className="table-wrap" key={ls.layer_id ?? 0}>
                  {ls.layer_no && <div className="ri-note">Layer {ls.layer_no}: premium for 100% {minorText(ls.premium100Minor, cur)}{ls.ratePpm != null ? ` at ${(ls.ratePpm / 10000).toFixed(4)}%` : ""}</div>}
                  <table className="data-table">
                    <thead><tr><th>Reinsurer</th><th className="ri-num">Share</th><th className="ri-num">Premium</th><th className="ri-num">Brokerage</th><th className="ri-num">Net</th></tr></thead>
                    <tbody>
                      {ls.rows.map((r) => <tr key={r.reinsurer_party_id}><td>{r.name}{r.differs_from_lead && <span className="ri-flag warn" title="Quoted terms differ from the lead's">⚠</span>}</td>
                        <td className="ri-num">{bpsText(r.line_bps)}</td><td className="ri-num">{minorText(r.premium_minor, cur)}</td><td className="ri-num">{minorText(r.brokerage_minor, cur)}</td><td className="ri-num">{minorText(r.net_minor, cur)}</td></tr>)}
                      <tr><th>Total</th><th className="ri-num">{bpsText(ls.rows.reduce((s, r) => s + r.line_bps, 0))}</th><th className="ri-num">{minorText(ls.premiumForOrderMinor, cur)}</th>
                        <th className="ri-num">{minorText(ls.brokerageMinor, cur)}</th><th className="ri-num">{minorText(ls.netMinor, cur)}</th></tr>
                    </tbody></table>
                </div>
              ))}
              {v.premium.layers.length > 1 && <p><strong>All layers:</strong> premium {minorText(v.premium.premiumForOrderMinor, cur)}, brokerage {minorText(v.premium.brokerageMinor, cur)}, net {minorText(v.premium.netMinor, cur)}</p>}
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="ri" label="Placement sections" />
        <div role="tabpanel" id={`ri-panel-${tab}`} aria-labelledby={`ri-tab-${tab}`} tabIndex={0} className="exec-tabpanel">
          {tab === "quotes" && <QuotesTab v={v} run={run} post={post} canEdit={canEdit} />}
          {tab === "compliance" && <ComplianceTab v={v} run={run} base={base} canEdit={can("ri.placement.edit")} />}
          {tab === "approvals" && (
            <div className="card"><h2>Bind and sign requests</h2>
              <p className="ri-note">A different person must approve each request. If the line-up (or, for a treaty, its terms) changes after a request is made, it is voided.</p>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Status</th><th>Requested by</th><th>Decided by</th><th>Warnings at the time</th></tr></thead>
                <tbody>{!v.approvals.length && <tr><td colSpan={5}>No requests yet.</td></tr>}
                  {v.approvals.map((a) => <tr key={a.id}><td>{a.action}</td><td><StatusBadge status={a.status} /></td><td>{a.requested_by}<div className="ri-note">{a.requested_at}</div></td>
                    <td>{a.decided_by || "—"}<div className="ri-note">{a.note || ""}</div></td><td>{a.warnings.length ? <ul style={{ margin: 0, paddingLeft: "1rem" }}>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : "None"}</td></tr>)}
                </tbody></table></div>
            </div>
          )}
          {tab === "documents" && <DocumentsTab v={v} base={base} />}
          {tab === "billing" && <PlacementBillingTab v={v} />}
          {tab === "attachments" && <AttachmentsPanel ownerType="placement" ownerId={p.id} canUpload={can("ri.placement.edit")} />}
          {tab === "correspondence" && <CorrespondenceTab v={v} run={run} base={base} canEdit={can("ri.placement.edit")} />}
          {tab === "clauses" && <ClausesTab v={v} run={run} base={base} canEdit={canEdit} />}
          {tab === "history" && <HistoryTab v={v} />}
        </div>
      </div>
    </div>
  );
}

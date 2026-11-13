import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { errorText, useReinsuranceStatus } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

function useAct() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const act = async (done: string, fn: () => Promise<unknown>) => {
    setError(null); setOk(null);
    try { await fn(); setOk(done); } catch (e) { setError(errorText(e)); }
    await qc.invalidateQueries({ queryKey: ["ri"] });
  };
  return { error, ok, act };
}
const Flash = ({ error, ok }: { error: string | null; ok: string | null }) => (<>{error && <div className="flash flash-error">{error}</div>}{ok && <div className="flash flash-success">{ok}</div>}</>);

// Bind and sign requests waiting for a second person.
export function ApprovalsPage() {
  const { can, isLoading } = useReinsuranceStatus();
  const { user } = useAuth();
  const { error, ok, act } = useAct();
  const q = useQuery({
    queryKey: ["ri", "approvals"],
    queryFn: () => api.get<{ approvals: { id: number; placement_id: number; placement_ref: string; action: string; requested_by: string; requested_at: string; original_insured: string | null; placement_status: string; warnings: string[] }[] }>("/api/reinsurance/approvals"),
    enabled: can("ri.placement.approve") || can("ri.sign.approve"),
  });
  if (!isLoading && !can("ri.placement.approve") && !can("ri.sign.approve")) return <div className="flash flash-error">You don't have an approval role.</div>;
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Approvals</h1></div></div>
      <Flash error={error} ok={ok} />
      <div className="card"><div className="table-wrap"><table className="data-table">
        <thead><tr><th>Placement</th><th>Request</th><th>By</th><th>Warnings</th><th /></tr></thead>
        <tbody>{!q.data?.approvals.length && <tr><td colSpan={5}>Nothing is waiting for approval.</td></tr>}
          {(q.data?.approvals ?? []).map((a) => (
            <tr key={a.id}><td><Link to={`/reinsurance/placements/${a.placement_id}`}>{a.placement_ref}</Link><div className="ri-note">{a.original_insured || ""} · {a.placement_status}</div></td>
              <td><strong>{a.action}</strong></td><td>{a.requested_by}<div className="ri-note">{a.requested_at}</div></td>
              <td>{a.warnings.length ? <ul style={{ margin: 0, paddingLeft: "1rem" }}>{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : "None"}</td>
              <td>{a.requested_by === user?.username ? <span className="muted">Needs another person</span> : <>
                <button type="button" className="btn btn-sm" onClick={() => act(`${a.action} approved.`, () => api.post(`/api/reinsurance/approvals/${a.id}/decision`, { approve: true }))}>Approve</button>{" "}
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Rejected.", () => api.post(`/api/reinsurance/approvals/${a.id}/decision`, { approve: false, note: window.prompt("Reason (optional)") || undefined }))}>Reject</button></>}</td></tr>))}</tbody></table></div></div>
    </div>
  );
}

interface RegRule { id: number; code: string; title: string; description: string | null; rule_type: string; enforcement: string; params: Record<string, unknown>; effective_from: string; effective_to: string | null; status: string; verified: number; verify_note: string; source_note: string | null; proposed_by: string }
interface SecRule { id: number; name: string; agency: string; min_rating: string; class_of_business: string | null; business_type: string | null; action: string; effective_from: string; effective_to: string | null; status: string; proposed_by: string }
interface Approved { id: number; party_name: string; party_reference: string; approved_for: string; committee_ref: string | null; effective_from: string; effective_to: string | null; status: string; proposed_by: string }

// Regulatory rules, minimum-rating rules and the approved-reinsurer list. Every
// change is proposed by one person and approved by another.
export function GovernancePage() {
  const { can, isLoading } = useReinsuranceStatus();
  const { user } = useAuth();
  const { error, ok, act } = useAct();
  const regs = useQuery({ queryKey: ["ri", "reg-rules"], queryFn: () => api.get<{ rules: RegRule[] }>("/api/reinsurance/regulatory-rules"), enabled: can("ri.view") });
  const secs = useQuery({ queryKey: ["ri", "sec-rules"], queryFn: () => api.get<{ rules: SecRule[] }>("/api/reinsurance/security-rules"), enabled: can("ri.view") });
  const appr = useQuery({ queryKey: ["ri", "approved"], queryFn: () => api.get<{ entries: Approved[] }>("/api/reinsurance/approved-list"), enabled: can("ri.view") });
  const reinsurers = useQuery({ queryKey: ["ri", "reinsurers"], queryFn: () => api.get<{ rows: { id: number; name: string }[] }>("/api/reinsurance/parties?type=Reinsurer&limit=200"), enabled: can("ri.view") });
  const [reg, setReg] = useState({ code: "", title: "", rule_type: "other", enforcement: "warn", effective_from: "", params: "{}", source_note: "", description: "" });
  const [sec, setSec] = useState({ name: "", agency: "AM Best", min_rating: "", class_of_business: "", business_type: "", action: "warn", effective_from: "" });
  const [ap, setAp] = useState({ party_id: "", approved_for: "Both", committee_ref: "", effective_from: "" });
  if (!isLoading && !can("ri.view")) return <div className="flash flash-error">You don't have access to reinsurance.</div>;
  const propose = can("ri.rules.propose");
  const decide = can("ri.rules.approve");
  const decisionButtons = (url: string, by: string, regulatory = false) => by === user?.username
    ? <span className="muted">Needs another person</span>
    : decide ? <>
      <button type="button" className="btn btn-sm" onClick={() => act("Approved.", () => api.post(url, { approve: true, verified: regulatory && window.confirm("Have you checked this rule against the current NIIRA 2025 text and NAICOM circulars? OK marks it verified.") }))}>Approve</button>{" "}
      <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Rejected.", () => api.post(url, { approve: false }))}>Reject</button></> : null;
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Rules and approved list</h1></div></div>
      <Flash error={error} ok={ok} />
      <div className="card"><h2>Regulatory placement rules</h2>
        <div className="flash flash-warning">Verify against current NIIRA 2025 and NAICOM circulars. These were drafted from published summaries and are not a legal opinion. Change a rule by proposing a new version with a later effective date.</div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Rule</th><th>Enforcement</th><th>From</th><th>To</th><th>Status</th><th>Verified</th><th /></tr></thead>
          <tbody>{(regs.data?.rules ?? []).map((r) => <tr key={r.id}><td><strong>{r.code}</strong><div className="ri-note">{r.title}</div><div className="ri-note">{r.description}</div>{r.source_note && <div className="ri-note">Source: {r.source_note}</div>}
            {Object.keys(r.params).length > 0 && <div className="ri-note">Parameters: {JSON.stringify(r.params)}</div>}</td>
            <td>{r.enforcement}</td><td>{r.effective_from}</td><td>{r.effective_to || "—"}</td><td><StatusBadge status={r.status} /></td><td>{r.verified ? "Yes" : <span title={r.verify_note}>No</span>}</td>
            <td>{r.status === "Pending" && decisionButtons(`/api/reinsurance/regulatory-rules/${r.id}/decision`, r.proposed_by, true)}</td></tr>)}</tbody></table></div>
        {propose && (
          <form onSubmit={(e) => { e.preventDefault(); act("Rule proposed.", () => api.post("/api/reinsurance/regulatory-rules", { ...reg, params: reg.params || "{}" })); }}>
            <h3>Propose a rule or a new version</h3>
            <div className="form-grid">
              <div className="field"><label htmlFor="g-code">Code</label><input id="g-code" value={reg.code} onChange={(e) => setReg({ ...reg, code: e.target.value.toUpperCase() })} /></div>
              <div className="field span-2"><label htmlFor="g-title">Title</label><input id="g-title" value={reg.title} onChange={(e) => setReg({ ...reg, title: e.target.value })} /></div>
              <div className="field"><label htmlFor="g-type">Type</label><select id="g-type" value={reg.rule_type} onChange={(e) => setReg({ ...reg, rule_type: e.target.value })}>
                {["local_capacity_first", "prior_approval_offshore", "treaty_filing", "compulsory_cession", "counterparty_standing", "other"].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="g-enf">Enforcement</label><select id="g-enf" value={reg.enforcement} onChange={(e) => setReg({ ...reg, enforcement: e.target.value })}><option>off</option><option>warn</option><option>block</option></select></div>
              <div className="field"><label htmlFor="g-from">Effective from</label><input id="g-from" type="date" value={reg.effective_from} onChange={(e) => setReg({ ...reg, effective_from: e.target.value })} /></div>
              <div className="field span-2"><label htmlFor="g-desc">Description</label><input id="g-desc" value={reg.description} onChange={(e) => setReg({ ...reg, description: e.target.value })} /></div>
              <div className="field span-2"><label htmlFor="g-src">Source (circular, section, date)</label><input id="g-src" value={reg.source_note} onChange={(e) => setReg({ ...reg, source_note: e.target.value })} /></div>
              <div className="field span-2"><label htmlFor="g-par">Parameters (JSON)</label><input id="g-par" value={reg.params} onChange={(e) => setReg({ ...reg, params: e.target.value })} /></div>
            </div>
            <button className="btn btn-sm" type="submit" disabled={!reg.code || !reg.title || !reg.effective_from}>Propose</button>
          </form>
        )}
      </div>

      <div className="card"><h2>Minimum security (rating) rules</h2>
        <p className="ri-note">None are set. A placement is not checked against a minimum rating until you add and approve a rule.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Rule</th><th>Minimum</th><th>Applies to</th><th>Action</th><th>From</th><th>Status</th><th /></tr></thead>
          <tbody>{!secs.data?.rules.length && <tr><td colSpan={7}>No rules.</td></tr>}
            {(secs.data?.rules ?? []).map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.agency} {r.min_rating}</td><td>{r.class_of_business || "All classes"} · {r.business_type || "Any business"}</td><td>{r.action}</td><td>{r.effective_from}</td><td><StatusBadge status={r.status} /></td>
              <td>{r.status === "Pending" && decisionButtons(`/api/reinsurance/security-rules/${r.id}/decision`, r.proposed_by)}</td></tr>)}</tbody></table></div>
        {propose && (
          <form onSubmit={(e) => { e.preventDefault(); act("Rule proposed.", () => api.post("/api/reinsurance/security-rules", { ...sec, class_of_business: sec.class_of_business || undefined, business_type: sec.business_type || undefined })); }}>
            <div className="ri-inline">
              <div className="field"><label htmlFor="s-name">Name</label><input id="s-name" value={sec.name} onChange={(e) => setSec({ ...sec, name: e.target.value })} /></div>
              <div className="field"><label htmlFor="s-ag">Agency</label><select id="s-ag" value={sec.agency} onChange={(e) => setSec({ ...sec, agency: e.target.value })}>{["AM Best", "S&P", "Fitch", "GCR", "Moody's"].map((a) => <option key={a}>{a}</option>)}</select></div>
              <div className="field"><label htmlFor="s-min">Minimum rating</label><input id="s-min" value={sec.min_rating} onChange={(e) => setSec({ ...sec, min_rating: e.target.value })} /></div>
              <div className="field"><label htmlFor="s-cls">Class (optional)</label><input id="s-cls" value={sec.class_of_business} onChange={(e) => setSec({ ...sec, class_of_business: e.target.value })} /></div>
              <div className="field"><label htmlFor="s-bt">Business</label><select id="s-bt" value={sec.business_type} onChange={(e) => setSec({ ...sec, business_type: e.target.value })}><option value="">Any</option><option>Treaty</option><option>Facultative</option></select></div>
              <div className="field"><label htmlFor="s-act">If below</label><select id="s-act" value={sec.action} onChange={(e) => setSec({ ...sec, action: e.target.value })}><option value="warn">Warn</option><option value="block">Block binding</option></select></div>
              <div className="field"><label htmlFor="s-from">Effective from</label><input id="s-from" type="date" value={sec.effective_from} onChange={(e) => setSec({ ...sec, effective_from: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!sec.name || !sec.min_rating || !sec.effective_from}>Propose</button>
            </div>
          </form>
        )}
      </div>

      <div className="card"><h2>Approved-reinsurer list</h2>
        <p className="ri-note">Once at least one entry is active, a reinsurer who is not on the list is flagged on every placement.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Reinsurer</th><th>For</th><th>Committee ref</th><th>From</th><th>Status</th><th /></tr></thead>
          <tbody>{!appr.data?.entries.length && <tr><td colSpan={6}>The list is empty.</td></tr>}
            {(appr.data?.entries ?? []).map((a) => <tr key={a.id}><td>{a.party_name}<div className="ri-note">{a.party_reference}</div></td><td>{a.approved_for}</td><td>{a.committee_ref || "—"}</td><td>{a.effective_from}</td><td><StatusBadge status={a.status} /></td>
              <td>{a.status === "Pending" && decisionButtons(`/api/reinsurance/approved-list/${a.id}/decision`, a.proposed_by)}
                {a.status === "Active" && decide && <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Withdrawn.", () => api.delete(`/api/reinsurance/approved-list/${a.id}`))}>Withdraw</button>}</td></tr>)}</tbody></table></div>
        {propose && (
          <form onSubmit={(e) => { e.preventDefault(); act("Entry proposed.", () => api.post("/api/reinsurance/approved-list", { ...ap, party_id: Number(ap.party_id), committee_ref: ap.committee_ref || undefined })); }}>
            <div className="ri-inline">
              <div className="field"><label htmlFor="a-p">Reinsurer</label><select id="a-p" value={ap.party_id} onChange={(e) => setAp({ ...ap, party_id: e.target.value })}><option value="">Choose…</option>{(reinsurers.data?.rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
              <div className="field"><label htmlFor="a-f">Approved for</label><select id="a-f" value={ap.approved_for} onChange={(e) => setAp({ ...ap, approved_for: e.target.value })}><option>Both</option><option>Treaty</option><option>Facultative</option></select></div>
              <div className="field"><label htmlFor="a-c">Committee ref</label><input id="a-c" value={ap.committee_ref} onChange={(e) => setAp({ ...ap, committee_ref: e.target.value })} /></div>
              <div className="field"><label htmlFor="a-e">Effective from</label><input id="a-e" type="date" value={ap.effective_from} onChange={(e) => setAp({ ...ap, effective_from: e.target.value })} /></div>
              <button className="btn btn-sm" type="submit" disabled={!ap.party_id || !ap.effective_from}>Propose</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface RoleInfo { code: string; name: string; description: string; permissions: string[] }
interface UserRoles { id: number; username: string; role: string; riRoles: string[] }

// Admin: the module switch, who holds which reinsurance role, the data-protection
// placeholders and CBN FX rates.
export function RiAdminPage() {
  const { user } = useAuth();
  const { error, ok, act } = useAct();
  const settings = useQuery({ queryKey: ["ri", "settings"], queryFn: () => api.get<{ settings: Record<string, string>; enabledByEnvironment: string | null }>("/api/reinsurance/settings") });
  const { status } = useReinsuranceStatus();
  const on = Boolean(status?.enabled); // these routes answer 404 while the module is off
  const roles = useQuery({ queryKey: ["ri", "roles"], queryFn: () => api.get<{ roles: RoleInfo[]; users: UserRoles[] }>("/api/reinsurance/roles"), enabled: on });
  const rates = useQuery({ queryKey: ["ri", "fx"], queryFn: () => api.get<{ rates: { id: number; currency: string; rate_date: string; rate_micro: number; source: string }[] }>("/api/reinsurance/fx-rates"), enabled: on });
  const [fx, setFx] = useState({ currency: "USD", rate_date: "", rate: "" });
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!user?.isAdmin) return <div className="flash flash-error">Administrators only.</div>;
  const s = settings.data?.settings ?? {};
  const value = (k: string) => draft[k] ?? s[k] ?? "";
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Reinsurance</p><h1>Administration</h1></div></div>
      <Flash error={error} ok={ok} />
      <div className="card"><h2>Module</h2>
        <p>The module is <strong>{s.enabled === "1" ? "on" : "off"}</strong>.{settings.data?.enabledByEnvironment ? ` The REINSURANCE_ENABLED environment variable is set to ${settings.data.enabledByEnvironment} and overrides this switch.` : ""}</p>
        <button type="button" className="btn btn-sm" onClick={() => act(s.enabled === "1" ? "Module switched off." : "Module switched on.", () => api.put("/api/reinsurance/settings", { enabled: s.enabled === "1" ? "0" : "1" }))}>{s.enabled === "1" ? "Switch off" : "Switch on"}</button>
        <h3>Data protection placeholders</h3>
        <p className="ri-note">Left blank until your policy is decided. Nothing in the module enforces these yet.</p>
        <div className="form-grid">
          {([["retention_policy_years", "Retention period (years)"], ["data_protection_officer", "Data protection officer"], ["retention_notes", "Retention and deletion notes"]] as [string, string][]).map(([k, label]) => (
            <div className="field" key={k}><label htmlFor={k}>{label}</label><input id={k} value={value(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></div>))}
        </div>
        <button type="button" className="btn-secondary btn btn-sm" onClick={() => act("Settings saved.", () => api.put("/api/reinsurance/settings", { retention_policy_years: value("retention_policy_years"), data_protection_officer: value("data_protection_officer"), retention_notes: value("retention_notes") }))}>Save</button>
      </div>

      <div className="card"><h2>Roles</h2>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Role</th><th>What it can do</th></tr></thead>
          <tbody>{(roles.data?.roles ?? []).map((r) => <tr key={r.code}><td><strong>{r.name}</strong></td><td>{r.description}<div className="ri-note">{r.permissions.join(", ")}</div></td></tr>)}</tbody></table></div>
        <p className="ri-note">Administrators can do everything, except approve their own requests. For real maker-checker, give the maker and the checker different people.</p>
        <h3>Who holds which role</h3>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th>{(roles.data?.roles ?? []).map((r) => <th key={r.code}>{r.name}</th>)}</tr></thead>
          <tbody>{(roles.data?.users ?? []).map((u) => (
            <tr key={u.id}><td>{u.username}<div className="ri-note">{u.role}</div></td>
              {(roles.data?.roles ?? []).map((r) => (
                <td key={r.code}><input type="checkbox" aria-label={`${u.username} ${r.name}`} checked={u.riRoles.includes(r.code)}
                  onChange={(e) => act("Roles updated.", () => api.put(`/api/reinsurance/users/${u.id}/roles`, { roles: e.target.checked ? [...u.riRoles, r.code] : u.riRoles.filter((c) => c !== r.code) }))} /></td>))}</tr>))}</tbody></table></div>
      </div>

      <div className="card"><h2>CBN official exchange rates</h2>
        <p className="ri-note">Naira per one unit of foreign currency, entered by hand from the CBN rate. The rate on or before the transaction date is used; one with no rate that day falls back to the latest earlier one and is flagged when older than {s.fx_stale_days || 5} days.</p>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Currency</th><th className="ri-num">NGN per unit</th><th>Source</th></tr></thead>
          <tbody>{!rates.data?.rates.length && <tr><td colSpan={4}>No rates entered.</td></tr>}
            {(rates.data?.rates ?? []).slice(0, 30).map((r) => <tr key={r.id}><td>{r.rate_date}</td><td>{r.currency}</td><td className="ri-num">{(r.rate_micro / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td><td>{r.source}</td></tr>)}</tbody></table></div>
        <div className="ri-inline">
          <div className="field"><label htmlFor="fx-c">Currency</label><select id="fx-c" value={fx.currency} onChange={(e) => setFx({ ...fx, currency: e.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></div>
          <div className="field"><label htmlFor="fx-d">Date</label><input id="fx-d" type="date" value={fx.rate_date} onChange={(e) => setFx({ ...fx, rate_date: e.target.value })} /></div>
          <div className="field"><label htmlFor="fx-r">Rate</label><input id="fx-r" inputMode="decimal" value={fx.rate} onChange={(e) => setFx({ ...fx, rate: e.target.value })} /></div>
          <button type="button" className="btn btn-sm" disabled={!fx.rate_date || !fx.rate} onClick={() => act("Rate saved.", () => api.post("/api/reinsurance/fx-rates", fx).then(() => setFx({ ...fx, rate: "" })))}>Add rate</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { COMPONENT_TYPES, TYPE_LABEL, WORDING_GROUPS, pb, qs, usePbAccess, type ComponentType, type Paged, type PbComponent } from "../api/policyBank";
import { LegacyImportCard } from "../components/LegacyImportCard";
import { Field, Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";

const GROUP_LINKS = Object.values(WORDING_GROUPS);
const APPROVALS = ["", "Draft", "Submitted", "UnderReview", "Approved", "Rejected", "Superseded", "Expired", "Deactivated"];

function latest(c: PbComponent) {
  const master = c.versions.filter((v) => v.insurer_id === null);
  return master.find((v) => v.approval_status === "Approved") ?? master.at(-1) ?? c.versions.at(-1);
}

export function PbWordingsPage() {
  const { group = "all" } = useParams();
  const def = WORDING_GROUPS[group] ?? WORDING_GROUPS.all;
  const navigate = useNavigate();
  const { can } = usePbAccess();
  const [q, setQ] = useState("");
  const [approval, setApproval] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("Active");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", component_type: def.createAs as ComponentType, wording: "", description: "" });

  const types = type ? [type] : def.types;
  const list = useQuery({
    queryKey: ["pb", "components", group, q, approval, type, status, effectiveOn, page],
    queryFn: () => pb.get<Paged<PbComponent>>(`/components${qs({ q, approval, status, effectiveOn, page, perPage: 25 })}${types.length ? `&${types.map((t) => `type=${t}`).join("&")}` : ""}`),
  });

  const create = useAct(
    () => pb.post<{ component: PbComponent }>("/components", { ...form, component_type: form.component_type }),
    (r) => { setCreating(false); void navigate(`/policy-bank/wordings/component/${r.component.id}`); return "Created as a draft."; },
  );

  const rows = list.data?.rows ?? [];
  return (
    <PbLayout
      title={def.label}
      intro="Reusable wording components. Open one to see its version history, edit a draft, or put a new version up for approval."
      actions={can("policy_bank.create") && <button type="button" className="btn" onClick={() => { setForm({ ...form, component_type: def.createAs }); setCreating(true); }}>+ New wording</button>}
    >
      <div className="pb-tabs" style={{ marginTop: "-0.5rem" }}>
        {GROUP_LINKS.map((g) => (
          <Link key={g.path} to={`/policy-bank/wordings/${g.path}`} className={`pb-tab${g.path === group ? " active" : ""}`}>{g.label}</Link>
        ))}
      </div>
      <Flash error={create.error} ok={create.ok} />
      {group === "all" && <LegacyImportCard />}

      {creating && (
        <div className="card">
          <h2 className="card-title">New wording</h2>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
            <div className="form-grid">
              <Field label="Code" hint="Letters, digits, - and _. Shared wordings start GEN-."><input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Type">
                <select className="form-control" value={form.component_type} onChange={(e) => setForm({ ...form, component_type: e.target.value as ComponentType })}>
                  {COMPONENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Wording" hint="Use {{client.name}}-style variables from the Variables list. Anything else in double braces is refused.">
              <textarea className="form-control pb-textarea" value={form.wording} onChange={(e) => setForm({ ...form, wording: e.target.value })} />
            </Field>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={create.isPending}>Create draft</button>
              <button type="button" className="btn-secondary btn" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Search code, name or wording…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {def.types.length > 1 || group === "all" ? (
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {(def.types.length ? def.types : COMPONENT_TYPES).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        ) : null}
        <select value={approval} onChange={(e) => { setApproval(e.target.value); setPage(1); }}>
          {APPROVALS.map((a) => <option key={a} value={a}>{a ? `Has a ${a === "UnderReview" ? "under review" : a.toLowerCase()} version` : "Any version status"}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="Active">Active</option><option value="Deactivated">Deactivated</option><option value="">All</option>
        </select>
        <label className="pb-muted">In force on <input type="date" value={effectiveOn} onChange={(e) => { setEffectiveOn(e.target.value); setPage(1); }} /></label>
      </div>

      <div className="card pb-table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Current version</th><th>Status</th><th>Effective</th><th /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
            {!list.isLoading && rows.length === 0 && <tr><td colSpan={7} className="pb-muted">Nothing matches.</td></tr>}
            {rows.map((c) => {
              const v = latest(c);
              return (
                <tr key={c.id}>
                  <td className="pb-code">{c.code}</td>
                  <td><Link to={`/policy-bank/wordings/component/${c.id}`}>{c.name}</Link>{c.status !== "Active" && <> <PbStatus status={c.status} /></>}</td>
                  <td>{TYPE_LABEL[c.component_type]}</td>
                  <td>{v ? `v${v.version}` : "—"}{c.versions.length > 1 && <span className="pb-muted"> ({c.versions.length} versions)</span>}</td>
                  <td>{v && <PbStatus status={v.approval_status} />}</td>
                  <td>{v?.effective_from ?? "—"}{v?.effective_to ? ` to ${v.effective_to}` : ""}</td>
                  <td><Link className="btn-secondary btn" to={`/policy-bank/wordings/component/${c.id}`}>Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.data && list.data.totalPages > 1 && (
          <div className="pagination">
            <button type="button" className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
            <span className="pagination-status">Page {list.data.page} of {list.data.totalPages} ({list.data.total} total)</span>
            <button type="button" className="pagination-btn" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </PbLayout>
  );
}

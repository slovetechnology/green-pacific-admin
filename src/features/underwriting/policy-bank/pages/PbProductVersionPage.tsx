import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { TYPE_LABEL, pb, qs, usePbAccess, type Paged, type PbComponent, type ProductVersionDetail, type PvItem, type PvLimit } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, ReasonButton, fmtAmount, useAct } from "../components/PbCommon";

type Tab = "components" | "limits" | "rules";
const KIND_LABEL = { limit: "Limits", sub_limit: "Sub-limits", excess: "Excesses / deductibles" } as const;
const BASIS_LABEL: Record<string, string> = {
  fixed: "Fixed amount", percent_of_sum_insured: "% of sum insured", percent_of_loss: "% of loss", percent_of_claim: "% of claim",
  minimum_and_percent: "% of loss, with a minimum", per_event: "Per event", aggregate: "Aggregate", as_scheduled: "As scheduled",
};

function limitValue(l: PvLimit) {
  if (l.basis === "as_scheduled") return "As scheduled";
  if (l.percentage !== null && l.minimum_amount !== null) return `${l.percentage}% (min ${l.currency} ${fmtAmount(l.minimum_amount)})`;
  if (l.percentage !== null) return `${l.percentage}%`;
  return l.amount === null ? "—" : `${l.currency} ${fmtAmount(l.amount)}`;
}

function AddComponent({ pvId }: { pvId: number }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const found = useQuery({ queryKey: ["pb", "component-search", q], queryFn: () => pb.get<Paged<PbComponent>>(`/components${qs({ q, status: "Active", perPage: 10 })}`), enabled: open && q.length >= 2 });
  const add = useAct((componentId: number) => pb.post(`/product-versions/${pvId}/components`, { component_id: componentId }), () => "Component added.");
  if (!open) return <button type="button" className="btn-secondary btn" onClick={() => setOpen(true)}>+ Add a wording</button>;
  return (
    <div className="card">
      <Flash error={add.error} ok={add.ok} />
      <input type="search" autoFocus placeholder="Search by code, name or wording (2+ letters)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: "22rem" }} />
      <button type="button" className="btn-secondary btn" style={{ marginLeft: "0.5rem" }} onClick={() => setOpen(false)}>Close</button>
      <ul className="pb-list" style={{ marginTop: "0.6rem" }}>
        {(found.data?.rows ?? []).map((c) => (
          <li key={c.id}>
            <span className="pb-code">{c.code}</span> {c.name} <span className="pb-muted">({TYPE_LABEL[c.component_type]})</span>{" "}
            <button type="button" className="btn-secondary btn" disabled={add.isPending} onClick={() => add.mutate(c.id)}>Add</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComponentsTab({ d, editable, showWording }: { d: ProductVersionDetail; editable: boolean; showWording: boolean }) {
  const { can } = usePbAccess();
  const remove = useAct((linkId: number) => pb.del(`/product-versions/${d.productVersion.id}/components/${linkId}`), () => "Removed.");
  const flag = useAct((a: { linkId: number; patch: Record<string, unknown> }) => pb.put(`/product-versions/${d.productVersion.id}/components/${a.linkId}`, a.patch), () => "Saved.");
  const groups = new Map<string, PvItem[]>();
  for (const i of d.items) groups.set(i.component_type, [...(groups.get(i.component_type) ?? []), i]);
  return (
    <>
      <Flash error={remove.error ?? flag.error} ok={remove.ok ?? flag.ok} />
      {editable && can("policy_bank.edit") && <div style={{ marginBottom: "0.8rem" }}><AddComponent pvId={d.productVersion.id} /></div>}
      {[...groups.entries()].map(([type, items]) => (
        <div className="card" key={type}>
          <h3 className="card-title">{TYPE_LABEL[type]} ({items.length})</h3>
          <div className="pb-table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Wording version</th><th>Status</th><th>Mandatory</th><th>Offered by default</th>{editable && <th />}</tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.link_id}>
                    <td className="pb-code">{i.code}</td>
                    <td>
                      <Link to={`/policy-bank/wordings/component/${i.component_id}`}>{i.name}</Link>
                      {showWording && i.wording && <pre className="pb-wording" style={{ marginTop: "0.3rem" }}>{i.wording}</pre>}
                    </td>
                    <td>v{i.version}</td>
                    <td><PbStatus status={i.approval_status} /></td>
                    <td>{editable && can("policy_bank.edit") ? <input type="checkbox" checked={!!i.mandatory} onChange={(e) => flag.mutate({ linkId: i.link_id, patch: { mandatory: e.target.checked } })} /> : i.mandatory ? "Yes" : "—"}</td>
                    <td>{editable && can("policy_bank.edit") ? <input type="checkbox" checked={!!i.default_selected} onChange={(e) => flag.mutate({ linkId: i.link_id, patch: { default_selected: e.target.checked } })} /> : i.default_selected ? "Yes" : "—"}</td>
                    {editable && <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => remove.mutate(i.link_id)}>Remove</button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function LimitsTab({ d, editable }: { d: ProductVersionDetail; editable: boolean }) {
  const { can } = usePbAccess();
  const pvId = d.productVersion.id;
  const [form, setForm] = useState({ kind: "excess", code: "", name: "", basis: "fixed", amount: "", percentage: "", minimum_amount: "" });
  const add = useAct(
    () => pb.post(`/product-versions/${pvId}/limits`, {
      ...form, amount: form.amount === "" ? null : Number(form.amount), percentage: form.percentage === "" ? null : Number(form.percentage), minimum_amount: form.minimum_amount === "" ? null : Number(form.minimum_amount),
    }),
    () => { setForm({ ...form, code: "", name: "", amount: "", percentage: "", minimum_amount: "" }); return "Added."; },
  );
  const remove = useAct((id: number) => pb.del(`/product-versions/${pvId}/limits/${id}`), () => "Removed.");
  const update = useAct((a: { id: number; patch: Record<string, unknown> }) => pb.put(`/product-versions/${pvId}/limits/${a.id}`, a.patch), () => "Saved.");
  return (
    <>
      <Flash error={add.error ?? remove.error ?? update.error} ok={add.ok ?? remove.ok ?? update.ok} />
      {(["limit", "sub_limit", "excess"] as const).map((kind) => (
        <div className="card" key={kind}>
          <h3 className="card-title">{KIND_LABEL[kind]}</h3>
          <div className="pb-table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Basis</th><th>Value</th><th>Mandatory</th>{editable && <th />}</tr></thead>
              <tbody>
                {d.limits.filter((l) => l.kind === kind).length === 0 && <tr><td colSpan={6} className="pb-muted">None.</td></tr>}
                {d.limits.filter((l) => l.kind === kind).map((l) => (
                  <tr key={l.id}>
                    <td className="pb-code">{l.code}</td>
                    <td>{l.name}{l.description ? <div className="pb-muted" style={{ fontSize: "0.78rem" }}>{l.description}</div> : null}</td>
                    <td>{BASIS_LABEL[l.basis] ?? l.basis}</td>
                    <td>
                      {editable && can("policy_bank.edit") && l.percentage !== null ? (
                        <>
                          <input type="number" className="form-control" style={{ width: "6rem", display: "inline-block" }} defaultValue={l.percentage}
                            onBlur={(e) => { if (Number(e.target.value) !== l.percentage) update.mutate({ id: l.id, patch: { percentage: Number(e.target.value) } }); }} /> %
                        </>
                      ) : limitValue(l)}
                    </td>
                    <td>{l.mandatory ? "Yes" : "—"}</td>
                    {editable && <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => remove.mutate(l.id)}>Remove</button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {editable && can("policy_bank.edit") && (
        <div className="card">
          <h3 className="card-title">Add a limit, sub-limit or excess</h3>
          <form onSubmit={(e) => { e.preventDefault(); add.mutate(undefined); }}>
            <div className="form-grid">
              <Field label="Kind">
                <select className="form-control" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="limit">Limit</option><option value="sub_limit">Sub-limit</option><option value="excess">Excess</option>
                </select>
              </Field>
              <Field label="Code"><input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Basis">
                <select className="form-control" value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>
                  {Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Amount"><input type="number" className="form-control" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
              <Field label="Percentage"><input type="number" className="form-control" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} /></Field>
              <Field label="Minimum amount"><input type="number" className="form-control" value={form.minimum_amount} onChange={(e) => setForm({ ...form, minimum_amount: e.target.value })} /></Field>
            </div>
            <div className="form-actions"><button type="submit" className="btn" disabled={add.isPending}>Add</button></div>
          </form>
        </div>
      )}
    </>
  );
}

export function PbProductVersionPage() {
  const { id } = useParams();
  const { can } = usePbAccess();
  const [tab, setTab] = useState<Tab>("components");
  const [showWording, setShowWording] = useState(false);
  const q = useQuery({ queryKey: ["pb", "product-version", id, showWording], queryFn: () => pb.get<ProductVersionDetail>(`/product-versions/${id}${showWording ? "?wording=1" : ""}`) });
  const d = q.data;
  const pv = d?.productVersion;
  const editable = pv ? pv.approval_status === "Draft" || pv.approval_status === "Rejected" : false;

  const step = useAct((a: { action: string; reason?: string }) => pb.post(`/product-versions/${id}/transition`, a), () => "Done.");
  const submitAll = useAct(() => pb.post<{ submitted: number }>(`/product-versions/${id}/wordings/submit-all`), (r) => `${r.submitted} wording(s) submitted for approval.`);
  const approveAll = useAct(
    () => pb.post<{ approved: number; skipped: { code: string; reason: string }[] }>(`/product-versions/${id}/wordings/approve-all`),
    (r) => `${r.approved} wording(s) approved.${r.skipped.length ? ` ${r.skipped.length} skipped because you wrote them.` : ""}`,
  );
  const newVersion = useAct(() => pb.post<{ productVersion: { id: number } }>(`/products/${pv?.product_id}/versions`, { from_version_id: pv?.id }), (r) => `Draft v created (id ${r.productVersion.id}). Open it from the product list.`);

  return (
    <PbLayout
      title={d ? `${d.product.name} v${pv?.version}` : "Product version"}
      intro={d && <><PbStatus status={pv?.approval_status} /> · {d.summary.components} wordings · {d.summary.notApproved} not approved yet{pv?.effective_from ? ` · effective from ${pv.effective_from}` : ""}</>}
      actions={<Link className="btn-secondary btn" to="/policy-bank/products">← Products</Link>}
    >
      {q.isLoading && <p>Loading…</p>}
      <Flash error={q.error ?? step.error ?? submitAll.error ?? approveAll.error ?? newVersion.error} ok={step.ok ?? submitAll.ok ?? approveAll.ok ?? newVersion.ok} />
      {d && pv && (
        <>
          {pv.notes && <p className="pb-muted">{pv.notes}</p>}
          <div className="card">
            <h3 className="card-title">Workflow</h3>
            <div className="pb-row-actions">
              {editable && can("policy_bank.edit") && <button type="button" className="btn-secondary btn" disabled={submitAll.isPending} onClick={() => submitAll.mutate(undefined)}>Submit all draft wordings</button>}
              {can("policy_wording.approve") && d.summary.notApproved > 0 && <button type="button" className="btn-secondary btn" disabled={approveAll.isPending} onClick={() => { if (window.confirm("Approve every submitted wording in this version? Wordings you wrote yourself are skipped.")) approveAll.mutate(undefined); }}>Approve all submitted wordings</button>}
              {editable && can("policy_bank.edit") && <button type="button" className="btn" disabled={step.isPending} onClick={() => step.mutate({ action: "submit" })}>Submit product version</button>}
              {pv.approval_status === "Submitted" && can("policy_bank.approve") && <button type="button" className="btn-secondary btn" onClick={() => step.mutate({ action: "review" })}>Start review</button>}
              {(pv.approval_status === "Submitted" || pv.approval_status === "UnderReview") && can("policy_bank.approve") && (
                <>
                  <button type="button" className="btn" disabled={step.isPending} onClick={() => step.mutate({ action: "approve" })}>Approve product version</button>
                  <ReasonButton label="Reject" prompt="Why is this product version rejected?" onConfirm={(reason) => step.mutate({ action: "reject", reason })} />
                </>
              )}
              {pv.approval_status === "Approved" && can("policy_bank.deactivate") && <ReasonButton label="Deactivate" prompt="Why is this product version being deactivated?" onConfirm={(reason) => step.mutate({ action: "deactivate", reason })} />}
              {can("policy_bank.version") && <button type="button" className="btn-secondary btn" disabled={newVersion.isPending} onClick={() => newVersion.mutate(undefined)}>New version from this</button>}
            </div>
            <p className="pb-muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
              {editable ? "This version is a draft: wordings, limits and excesses can still change." : "This version is frozen. To change it, make a new version."}
              {pv.requires_legal_review ? " It is flagged as needing insurer / legal review." : ""}
            </p>
          </div>

          <div className="pb-tabs">
            {(["components", "limits", "rules"] as Tab[]).map((t) => (
              <button key={t} type="button" className={`pb-tab${tab === t ? " active" : ""}`} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setTab(t)}>
                {t === "components" ? `Wordings (${d.items.length})` : t === "limits" ? `Limits & excesses (${d.limits.length})` : `Rules (${d.rules.length})`}
              </button>
            ))}
            {tab === "components" && <label className="pb-muted" style={{ marginLeft: "auto" }}><input type="checkbox" checked={showWording} onChange={(e) => setShowWording(e.target.checked)} /> Show full wording</label>}
          </div>
          {tab === "components" && <ComponentsTab d={d} editable={editable} showWording={showWording} />}
          {tab === "limits" && <LimitsTab d={d} editable={editable} />}
          {tab === "rules" && (
            <div className="card pb-table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Priority</th></tr></thead>
                <tbody>
                  {d.rules.length === 0 && <tr><td colSpan={4} className="pb-muted">No rules apply.</td></tr>}
                  {d.rules.map((r) => <tr key={r.id}><td className="pb-code">{r.code}</td><td>{r.name}</td><td><PbStatus status={r.status} /></td><td>{r.priority}</td></tr>)}
                </tbody>
              </table>
              <p className="pb-muted">Rules are edited on the <Link to="/policy-bank/rules">Rules</Link> page.</p>
            </div>
          )}
        </>
      )}
    </PbLayout>
  );
}

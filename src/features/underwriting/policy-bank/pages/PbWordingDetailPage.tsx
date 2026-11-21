import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "@/shared/api/client";
import { TYPE_LABEL, pb, usePbAccess, type ComponentDetail, type PbVersion } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, ReasonButton, fmtDate, useAct } from "../components/PbCommon";
import { confirmDialog, promptDialog } from "@/shared/components/Dialogs";

export interface InsurerOption { id: number; name: string }
export function useInsurerOptions() {
  return useQuery({ queryKey: ["pb", "insurer-options"], queryFn: () => api.get<{ insurers: InsurerOption[] }>("/api/insurers/options"), staleTime: 300_000 });
}

const SOURCE_LABEL: Record<string, string> = {
  broker_master: "Broker master (specimen)", insurer_specific: "Insurer-specific", insurer_approved: "Insurer-approved", transaction_specific: "Transaction-specific",
};

function VersionCard({ v, insurerName }: { v: PbVersion; insurerName: (id: number | null) => string }) {
  const { can } = usePbAccess();
  const [editing, setEditing] = useState(false);
  const [wording, setWording] = useState(v.wording);
  const [from, setFrom] = useState(v.effective_from ?? "");
  const [to, setTo] = useState(v.effective_to ?? "");
  const [legal, setLegal] = useState(Boolean(v.requires_legal_review));
  const [open, setOpen] = useState(v.approval_status === "Approved" || v.approval_status === "Draft");
  const editable = v.approval_status === "Draft" || v.approval_status === "Rejected";

  const save = useAct(() => pb.put(`/component-versions/${v.id}`, { wording, effective_from: from || null, effective_to: to || null, requires_legal_review: legal }), () => { setEditing(false); return "Draft saved."; });
  const step = useAct((a: { action: string; reason?: string }) => pb.post(`/component-versions/${v.id}/transition`, a), () => "Done.");
  const del = useAct(() => pb.del(`/component-versions/${v.id}`), () => "Draft deleted.");

  return (
    <div className={`pb-version${v.approval_status === "Approved" ? " current" : ""}`}>
      <header>
        <strong>v{v.version}</strong>
        <PbStatus status={v.approval_status} />
        <span className="pb-muted">{SOURCE_LABEL[v.source]}{v.insurer_id ? `: ${insurerName(v.insurer_id)}` : ""}</span>
        <span className="pb-muted">Effective {fmtDate(v.effective_from)}{v.effective_to ? ` to ${v.effective_to}` : ""}</span>
        {v.requires_legal_review ? <span className="pb-warn">Needs legal / insurer review</span> : null}
        <button type="button" className="btn-secondary btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(!open)}>{open ? "Hide wording" : "Show wording"}</button>
      </header>
      <div className="pb-muted" style={{ fontSize: "0.8rem" }}>
        Written by {v.created_by ?? "—"}{v.submitted_by ? ` · submitted by ${v.submitted_by}` : ""}{v.approved_by ? ` · approved by ${v.approved_by} on ${v.approved_at?.slice(0, 10)}` : ""}
        {v.external_reference ? ` · authorised wording reference: ${v.external_reference}` : ""}
      </div>
      {v.rejection_reason && v.approval_status === "Rejected" && <div className="flash flash-warning" style={{ marginTop: "0.5rem" }}>Rejected: {v.rejection_reason}</div>}
      <Flash error={save.error ?? step.error ?? del.error} ok={save.ok ?? step.ok ?? del.ok} />

      {open && !editing && <pre className="pb-wording" style={{ marginTop: "0.5rem" }}>{v.wording}</pre>}
      {editing && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea className="form-control pb-textarea" value={wording} onChange={(e) => setWording(e.target.value)} />
          <div className="form-grid">
            <Field label="Effective from"><input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Effective to"><input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <label className="pb-muted" style={{ alignSelf: "end" }}><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> Needs legal / insurer review</label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save draft</button>
            <button type="button" className="btn-secondary btn" onClick={() => { setEditing(false); setWording(v.wording); }}>Cancel</button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="pb-row-actions" style={{ marginTop: "0.6rem" }}>
          {editable && can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => { setEditing(true); setOpen(true); }}>Edit</button>}
          {editable && can("policy_bank.edit") && <button type="button" className="btn" disabled={step.isPending} onClick={() => step.mutate({ action: "submit" })}>Submit for approval</button>}
          {editable && can("policy_bank.edit") && <button type="button" className="btn-secondary btn" disabled={del.isPending} onClick={async () => { if (await confirmDialog(`Delete draft v${v.version}?`)) del.mutate(undefined); }}>Delete draft</button>}
          {v.approval_status === "Submitted" && can("policy_wording.approve") && <button type="button" className="btn-secondary btn" onClick={() => step.mutate({ action: "review" })}>Start review</button>}
          {(v.approval_status === "Submitted" || v.approval_status === "UnderReview") && can("policy_wording.approve") && (
            <>
              <button type="button" className="btn" disabled={step.isPending} onClick={() => step.mutate({ action: "approve" })}>Approve</button>
              <ReasonButton label="Reject" prompt="Why is this wording rejected?" onConfirm={(reason) => step.mutate({ action: "reject", reason })} />
            </>
          )}
          {v.approval_status === "Approved" && can("policy_bank.deactivate") && (
            <ReasonButton label="Deactivate" prompt="Why is this approved wording being deactivated?" onConfirm={(reason) => step.mutate({ action: "deactivate", reason })} />
          )}
        </div>
      )}
    </div>
  );
}

function NewVersion({ detail, latest }: { detail: ComponentDetail; latest: PbVersion | undefined }) {
  const insurers = useInsurerOptions();
  const [open, setOpen] = useState(false);
  const [wording, setWording] = useState(latest?.wording ?? "");
  const [insurerId, setInsurerId] = useState("");
  const [source, setSource] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [major, setMajor] = useState(false);
  const create = useAct(
    () => pb.post(`/components/${detail.component.id}/versions`, {
      wording, insurer_id: insurerId ? Number(insurerId) : undefined, source: source || undefined, effective_from: effectiveFrom || undefined, major,
    }),
    () => { setOpen(false); return "New draft version created."; },
  );
  if (!open) return <button type="button" className="btn" onClick={() => { setWording(latest?.wording ?? ""); setOpen(true); }}>+ New version</button>;
  return (
    <div className="card">
      <h3 className="card-title">New version</h3>
      <Flash error={create.error} />
      <p className="pb-muted">The text starts from the latest version. An approved version is never edited: this creates a draft that replaces it when approved.</p>
      <textarea className="form-control pb-textarea" value={wording} onChange={(e) => setWording(e.target.value)} />
      <div className="form-grid">
        <Field label="Insurer" hint="Leave blank for the broker master wording.">
          <select className="form-control" value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setSource(e.target.value ? "insurer_specific" : ""); }}>
            <option value="">Broker master</option>
            {(insurers.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        {insurerId && (
          <Field label="Source">
            <select className="form-control" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="insurer_specific">Insurer-specific</option><option value="insurer_approved">Insurer-approved</option>
            </select>
          </Field>
        )}
        <Field label="Effective from"><input type="date" className="form-control" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></Field>
        <label className="pb-muted" style={{ alignSelf: "end" }}><input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} /> Major version (2.0 rather than 1.1)</label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" disabled={create.isPending} onClick={() => create.mutate(undefined)}>Create draft</button>
        <button type="button" className="btn-secondary btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function PbWordingDetailPage() {
  const { id } = useParams();
  const { can } = usePbAccess();
  const insurers = useInsurerOptions();
  const q = useQuery({ queryKey: ["pb", "component", id], queryFn: () => pb.get<ComponentDetail>(`/components/${id}`) });
  const deactivate = useAct((reason: string) => pb.post(`/components/${id}/deactivate`, { reason }), () => "Component deactivated.");
  const reactivate = useAct(() => pb.post(`/components/${id}/reactivate`), () => "Component reactivated.");
  const rename = useAct((name: string) => pb.put(`/components/${id}`, { name }), () => "Name saved.");

  const d = q.data;
  const insurerName = (iid: number | null) => (iid ? insurers.data?.insurers.find((i) => i.id === iid)?.name ?? `Insurer #${iid}` : "");
  const ordered = [...(d?.versions ?? [])].sort((a, b) => b.id - a.id);
  const newest = ordered[0];

  return (
    <PbLayout
      title={d ? d.component.name : "Wording"}
      intro={d && <><span className="pb-code">{d.component.code}</span> · {TYPE_LABEL[d.component.component_type]} · <PbStatus status={d.component.status} /></>}
      actions={<Link className="btn-secondary btn" to="/policy-bank/wordings/all">← All wordings</Link>}
    >
      {q.isLoading && <p>Loading…</p>}
      {q.error && <Flash error={q.error} />}
      <Flash error={deactivate.error ?? reactivate.error ?? rename.error} ok={deactivate.ok ?? reactivate.ok ?? rename.ok} />
      {d && (
        <div className="pb-split">
          <aside className="card">
            <h3 className="card-title">About</h3>
            {can("policy_bank.edit") && (
              <Field label="Name">
                <input className="form-control" defaultValue={d.component.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== d.component.name) rename.mutate(e.target.value); }} />
              </Field>
            )}
            <h4>Used in</h4>
            {d.usedIn.length === 0 ? <p className="pb-muted">No product version yet.</p> : (
              <ul className="pb-list">{d.usedIn.map((u) => <li key={u.product_version_id}><Link to={`/policy-bank/product-versions/${u.product_version_id}`}>{u.product_name} v{u.version}</Link> <PbStatus status={u.approval_status} /></li>)}</ul>
            )}
            <h4>Requires</h4>
            {d.dependencies.length === 0 ? <p className="pb-muted">Nothing.</p> : <ul className="pb-list">{d.dependencies.map((x) => <li key={x.id}>{x.message}</li>)}</ul>}
            <h4>Required by</h4>
            {d.requiredBy.length === 0 ? <p className="pb-muted">Nothing.</p> : <ul className="pb-list">{d.requiredBy.map((x) => <li key={x.id}>{x.message}</li>)}</ul>}
            <h4>Conflicts</h4>
            {d.conflicts.length === 0 ? <p className="pb-muted">None.</p> : <ul className="pb-list">{d.conflicts.map((x) => <li key={x.id}>{x.message}</li>)}</ul>}
            <div className="pb-row-actions" style={{ marginTop: "1rem" }}>
              {d.component.status === "Active" && can("policy_bank.deactivate") && (
                <button type="button" className="btn-secondary btn" onClick={async () => { const r = await promptDialog({ message: "Why is this component being deactivated?", required: true, multiline: true }); if (r?.trim()) deactivate.mutate(r.trim()); }}>Deactivate</button>
              )}
              {d.component.status !== "Active" && can("policy_bank.deactivate") && <button type="button" className="btn-secondary btn" onClick={() => reactivate.mutate(undefined)}>Reactivate</button>}
            </div>
          </aside>
          <section>
            <div style={{ marginBottom: "0.8rem" }}>{can("policy_bank.version") && <NewVersion key={newest?.id} detail={d} latest={newest} />}</div>
            <h3>Version history</h3>
            {ordered.map((v) => <VersionCard key={v.id} v={v} insurerName={insurerName} />)}
          </section>
        </div>
      )}
    </PbLayout>
  );
}

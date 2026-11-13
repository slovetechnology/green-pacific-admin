import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { pb, usePbAccess, type PbClass } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";

interface Form { code: string; name: string; group_name: string; class_of_business: string; status: string }
const EMPTY: Form = { code: "", name: "", group_name: "", class_of_business: "", status: "Active" };

export function PbClassesPage() {
  const { can } = usePbAccess();
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PbClass | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const list = useQuery({ queryKey: ["pb", "classes", group, q], queryFn: () => pb.get<{ classes: PbClass[] }>(`/classes?group=${encodeURIComponent(group)}&q=${encodeURIComponent(q)}`) });
  const groups = [...new Set((list.data?.classes ?? []).map((c) => c.group_name).filter(Boolean))] as string[];

  const save = useAct(
    (f: Form) => (editing ? pb.put(`/classes/${editing.id}`, f) : pb.post("/classes", f)),
    () => { setForm(null); setEditing(null); return "Class saved."; },
  );

  function open(c: PbClass | null) {
    setEditing(c);
    setForm(c ? { code: c.code, name: c.name, group_name: c.group_name ?? "", class_of_business: c.class_of_business ?? "", status: c.status } : EMPTY);
  }

  return (
    <PbLayout
      title="Classes of business"
      intro="The classes the bank can hold products for. Add a class here; no code change is needed."
      actions={can("policy_bank.create") && <button type="button" className="btn" onClick={() => open(null)}>+ New class</button>}
    >
      <Flash error={save.error} ok={save.ok} />
      {form && (
        <div className="card">
          <h2 className="card-title">{editing ? `Edit ${editing.code}` : "New class"}</h2>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <div className="form-grid">
              <Field label="Code"><input className="form-control" value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Group"><input className="form-control" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="e.g. Property" /></Field>
              <Field label="Class of business in the ERP" hint="Optional: the name used on transactions, so a policy finds its products."><input className="form-control" value={form.class_of_business} onChange={(e) => setForm({ ...form, class_of_business: e.target.value })} /></Field>
              <Field label="Status">
                <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Active</option><option>Inactive</option>
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
              <button type="button" className="btn-secondary btn" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Search classes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {[...new Set([...groups, group].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>

      <div className="card pb-table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Group</th><th>ERP class</th><th>Products</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
            {(list.data?.classes ?? []).map((c) => (
              <tr key={c.id}>
                <td className="pb-code">{c.code}</td>
                <td>{c.name}</td>
                <td>{c.group_name}</td>
                <td>{c.class_of_business ?? <span className="pb-muted">—</span>}</td>
                <td>{c.product_count ? <Link to={`/policy-bank/products?classId=${c.id}`}>{c.product_count}</Link> : 0}</td>
                <td><PbStatus status={c.status} /></td>
                <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => open(c)}>Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PbLayout>
  );
}

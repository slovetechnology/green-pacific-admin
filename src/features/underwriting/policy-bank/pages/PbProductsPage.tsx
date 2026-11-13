import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { pb, qs, usePbAccess, type Paged, type PbClass, type PbProduct } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";

export function PbProductsPage() {
  const { can } = usePbAccess();
  const [params, setParams] = useSearchParams();
  const classId = params.get("classId") ?? "";
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", class_id: "", description: "" });

  const classes = useQuery({ queryKey: ["pb", "classes"], queryFn: () => pb.get<{ classes: PbClass[] }>("/classes") });
  const list = useQuery({ queryKey: ["pb", "products", classId, q], queryFn: () => pb.get<Paged<PbProduct>>(`/products${qs({ classId, q, perPage: 200 })}`) });
  const className = new Map((classes.data?.classes ?? []).map((c) => [c.id, c.name]));

  const create = useAct(() => pb.post("/products", form), () => { setCreating(false); return "Product created. Add its first version below."; });
  const newVersion = useAct((productId: number) => pb.post<{ productVersion: { id: number } }>(`/products/${productId}/versions`, {}), () => "Draft version created.");

  return (
    <PbLayout
      title="Products"
      intro="A product is sold in versions. Each version pins the exact wording versions it contains, and is frozen once approved."
      actions={can("policy_bank.create") && <button type="button" className="btn" onClick={() => setCreating(true)}>+ New product</button>}
    >
      <Flash error={create.error ?? newVersion.error} ok={create.ok ?? newVersion.ok} />
      {creating && (
        <div className="card">
          <h2 className="card-title">New product</h2>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
            <div className="form-grid">
              <Field label="Code"><input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Class">
                <select className="form-control" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {(classes.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Description"><input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={create.isPending}>Create</button>
              <button type="button" className="btn-secondary btn" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={classId} onChange={(e) => setParams(e.target.value ? { classId: e.target.value } : {})}>
          <option value="">All classes</option>
          {(classes.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card pb-table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Class</th><th>Versions</th><th /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
            {!list.isLoading && list.data?.rows.length === 0 && <tr><td colSpan={4} className="pb-muted">No products match.</td></tr>}
            {(list.data?.rows ?? []).map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><div className="pb-code pb-muted">{p.code}</div></td>
                <td>{className.get(p.class_id)}</td>
                <td>
                  {p.versions.length === 0 && <span className="pb-muted">No versions yet</span>}
                  <div className="pb-row-actions">
                    {p.versions.map((v) => (
                      <Link key={v.id} to={`/policy-bank/product-versions/${v.id}`} className="pb-row-actions">
                        v{v.version} <PbStatus status={v.approval_status} />
                      </Link>
                    ))}
                  </div>
                </td>
                <td>{can("policy_bank.version") && <button type="button" className="btn-secondary btn" disabled={newVersion.isPending} onClick={() => newVersion.mutate(p.id)}>{p.versions.length ? "New version" : "First version"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PbLayout>
  );
}

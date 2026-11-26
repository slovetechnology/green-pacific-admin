import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, qs, usePbAccess, type Variable } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";

const ENTITIES = ["client", "insurer", "policy", "risk", "premium", "broker", "selection", "derived"];
const TYPES = ["text", "number", "money", "date", "boolean", "list"];

export function PbVariablesPage() {
  const { can } = usePbAccess();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [form, setForm] = useState<{ var_key: string; label: string; source_entity: string; source_field: string; data_type: string } | null>(null);
  const list = useQuery({ queryKey: ["pb", "variables", q, entity], queryFn: () => pb.get<{ variables: Variable[] }>(`/variables${qs({ q, entity })}`) });
  const create = useAct(() => pb.post("/variables", form), () => { setForm(null); return "Variable added."; });
  const toggle = useAct((v: Variable) => pb.put(`/variables/${v.id}`, { status: v.status === "Active" ? "Inactive" : "Active" }), () => "Saved.");

  return (
    <PbLayout
      title="Variables"
      intro="The whitelist of {{placeholders}} a wording may use. Nothing else between double braces is accepted, and nothing is ever evaluated: a placeholder is only looked up."
      actions={can("policy_bank.create") && <button type="button" className="btn" onClick={() => setForm({ var_key: "", label: "", source_entity: "selection", source_field: "", data_type: "text" })}>+ New variable</button>}
    >
      <Flash error={create.error ?? toggle.error} ok={create.ok ?? toggle.ok} />
      {form && (
        <div className="card">
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
            <div className="form-grid">
              <Field label="Key" hint="Like client.name"><input className="form-control" value={form.var_key} onChange={(e) => setForm({ ...form, var_key: e.target.value.toLowerCase() })} /></Field>
              <Field label="Label"><input className="form-control" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
              <Field label="Comes from"><select className="form-control" value={form.source_entity} onChange={(e) => setForm({ ...form, source_entity: e.target.value })}>{ENTITIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Source field"><input className="form-control" value={form.source_field} onChange={(e) => setForm({ ...form, source_field: e.target.value })} /></Field>
              <Field label="Type"><select className="form-control" value={form.data_type} onChange={(e) => setForm({ ...form, data_type: e.target.value })}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={create.isPending}>Add</button>
              <button type="button" className="btn-secondary btn" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      <div className="toolbar">
        <input type="search" placeholder="Search variables…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">All sources</option>{ENTITIES.map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="card pb-table-wrap">
        <table>
          <thead><tr><th>Placeholder</th><th>Label</th><th>Comes from</th><th>Type</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
            {(list.data?.variables ?? []).map((v) => (
              <tr key={v.id}>
                <td className="pb-code">{`{{${v.var_key}}}`}</td>
                <td>{v.label}{v.description && <div className="pb-muted" style={{ fontSize: "0.78rem" }}>{v.description}</div>}</td>
                <td>{v.source_entity}{v.source_field ? ` · ${v.source_field}` : <span className="pb-warn"> · entered at issue</span>}</td>
                <td>{v.data_type}</td>
                <td><PbStatus status={v.status} /></td>
                <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => toggle.mutate(v)}>{v.status === "Active" ? "Disable" : "Enable"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PbLayout>
  );
}

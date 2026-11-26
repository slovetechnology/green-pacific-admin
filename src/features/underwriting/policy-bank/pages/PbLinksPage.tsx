import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, usePbAccess } from "../api/policyBank";
import { Field, Flash, PbLayout, useAct } from "../components/PbCommon";

interface Dep { id: number; component_code: string | null; component_name: string | null; requires_component_code: string | null; requires_variable_key: string | null; message: string }
interface Con { id: number; component_code: string | null; component_name: string | null; conflicts_with_component_code: string | null; conflicts_with_component_name: string | null; unless_component_code: string | null; message: string }

export function PbLinksPage() {
  const { can } = usePbAccess();
  const deps = useQuery({ queryKey: ["pb", "dependencies"], queryFn: () => pb.get<{ dependencies: Dep[] }>("/dependencies") });
  const cons = useQuery({ queryKey: ["pb", "conflicts"], queryFn: () => pb.get<{ conflicts: Con[] }>("/conflicts") });
  const [dep, setDep] = useState({ component: "", kind: "variable", target: "", message: "" });
  const [con, setCon] = useState({ component: "", conflicts_with: "", message: "" });
  const [filter, setFilter] = useState("");

  const addDep = useAct(
    () => pb.post("/dependencies", { component: dep.component, message: dep.message, ...(dep.kind === "variable" ? { requires_variable_key: dep.target } : { requires_component: dep.target.toUpperCase() }) }),
    () => { setDep({ ...dep, component: "", target: "", message: "" }); return "Dependency added."; },
  );
  const addCon = useAct(() => pb.post("/conflicts", con), () => { setCon({ component: "", conflicts_with: "", message: "" }); return "Conflict added."; });
  const delDep = useAct((id: number) => pb.del(`/dependencies/${id}`), () => "Removed.");
  const delCon = useAct((id: number) => pb.del(`/conflicts/${id}`), () => "Removed.");

  const match = (s: string | null | undefined) => !filter || (s ?? "").toLowerCase().includes(filter.toLowerCase());
  return (
    <PbLayout title="Dependencies & conflicts" intro="A dependency says a wording cannot be used without something else. A conflict says two wordings cannot be used together. Both are checked when a policy is validated, with the message shown to the broker.">
      <Flash error={addDep.error ?? addCon.error ?? delDep.error ?? delCon.error} ok={addDep.ok ?? addCon.ok ?? delDep.ok ?? delCon.ok} />
      <div className="toolbar"><input type="search" placeholder="Filter by code or message…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>

      <div className="card pb-table-wrap">
        <h2 className="card-title">Dependencies</h2>
        <table>
          <thead><tr><th>Wording</th><th>Requires</th><th>Message shown</th><th /></tr></thead>
          <tbody>
            {(deps.data?.dependencies ?? []).filter((d) => match(d.component_code) || match(d.message)).map((d) => (
              <tr key={d.id}>
                <td><span className="pb-code">{d.component_code}</span><div className="pb-muted" style={{ fontSize: "0.78rem" }}>{d.component_name}</div></td>
                <td className="pb-code">{d.requires_component_code ?? `{{${d.requires_variable_key}}}`}</td>
                <td>{d.message}</td>
                <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => delDep.mutate(d.id)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {can("policy_bank.create") && (
          <form onSubmit={(e) => { e.preventDefault(); addDep.mutate(undefined); }} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <Field label="Wording code"><input className="form-control" value={dep.component} onChange={(e) => setDep({ ...dep, component: e.target.value.toUpperCase() })} /></Field>
              <Field label="Requires">
                <select className="form-control" value={dep.kind} onChange={(e) => setDep({ ...dep, kind: e.target.value })}><option value="variable">A detail (variable)</option><option value="component">Another wording</option></select>
              </Field>
              <Field label={dep.kind === "variable" ? "Variable key" : "Wording code"}><input className="form-control" value={dep.target} onChange={(e) => setDep({ ...dep, target: e.target.value })} /></Field>
              <Field label="Message"><input className="form-control" value={dep.message} onChange={(e) => setDep({ ...dep, message: e.target.value })} /></Field>
            </div>
            <div className="form-actions"><button type="submit" className="btn" disabled={addDep.isPending}>Add dependency</button></div>
          </form>
        )}
      </div>

      <div className="card pb-table-wrap">
        <h2 className="card-title">Conflicts</h2>
        <table>
          <thead><tr><th>Wording</th><th>Cannot be combined with</th><th>Message shown</th><th /></tr></thead>
          <tbody>
            {(cons.data?.conflicts ?? []).filter((c) => match(c.component_code) || match(c.conflicts_with_component_code) || match(c.message)).map((c) => (
              <tr key={c.id}>
                <td><span className="pb-code">{c.component_code}</span><div className="pb-muted" style={{ fontSize: "0.78rem" }}>{c.component_name}</div></td>
                <td><span className="pb-code">{c.conflicts_with_component_code}</span><div className="pb-muted" style={{ fontSize: "0.78rem" }}>{c.conflicts_with_component_name}</div></td>
                <td>{c.message}{c.unless_component_code ? <div className="pb-muted">Unless {c.unless_component_code}</div> : null}</td>
                <td>{can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => delCon.mutate(c.id)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {can("policy_bank.create") && (
          <form onSubmit={(e) => { e.preventDefault(); addCon.mutate(undefined); }} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <Field label="Wording code"><input className="form-control" value={con.component} onChange={(e) => setCon({ ...con, component: e.target.value.toUpperCase() })} /></Field>
              <Field label="Conflicts with (code)"><input className="form-control" value={con.conflicts_with} onChange={(e) => setCon({ ...con, conflicts_with: e.target.value.toUpperCase() })} /></Field>
              <Field label="Message"><input className="form-control" value={con.message} onChange={(e) => setCon({ ...con, message: e.target.value })} /></Field>
            </div>
            <div className="form-actions"><button type="submit" className="btn" disabled={addCon.isPending}>Add conflict</button></div>
          </form>
        )}
      </div>
    </PbLayout>
  );
}

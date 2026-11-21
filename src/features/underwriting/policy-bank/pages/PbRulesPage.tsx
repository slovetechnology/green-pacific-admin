import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb, qs, usePbAccess, type Rule } from "../api/policyBank";
import { Field, Flash, PbLayout, PbStatus, useAct } from "../components/PbCommon";
import { confirmDialog } from "@/shared/components/Dialogs";

const OPS: Record<string, string> = {
  eq: "is", neq: "is not", contains: "includes", not_contains: "does not include", gt: ">", lt: "<", gte: ">=", lte: "<=", exists: "is present", not_exists: "is missing", in: "is one of", not_in: "is not one of",
};

/** A rule's condition in words, so a reviewer can read it without the JSON. */
function describe(node: unknown): string {
  const n = node as Record<string, unknown>;
  if (!n || typeof n !== "object") return "";
  if (Array.isArray(n.all)) return `(${n.all.map(describe).join(" AND ")})`;
  if (Array.isArray(n.any)) return `(${n.any.map(describe).join(" OR ")})`;
  if (n.not) return `NOT ${describe(n.not)}`;
  return `${n.var} ${OPS[String(n.op)] ?? n.op}${n.value !== undefined ? ` ${JSON.stringify(n.value)}` : ""}`;
}
function describeAction(a: unknown): string {
  const x = a as { type: string; code?: string; var?: string };
  const verb: Record<string, string> = { add_component: "Add", remove_component: "Remove", add_limit: "Add limit", require_variable: "Require", require_component: "Require", allow_removal: "Allow removal of" };
  return `${verb[x.type] ?? x.type} ${x.code ?? x.var ?? ""}`;
}

const NEW_RULE = { code: "", name: "", description: "", priority: "100", condition: '{\n  "var": "selected.codes",\n  "op": "contains",\n  "value": "FSP-COV-FLOOD"\n}', actions: '[\n  { "type": "add_limit", "code": "FSP-XS-FLOOD" }\n]' };

export function PbRulesPage() {
  const { can } = usePbAccess();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState<typeof NEW_RULE | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["pb", "rules", status, q], queryFn: () => pb.get<{ rules: Rule[] }>(`/rules${qs({ status, q })}`) });

  function payload() {
    if (!form) return null;
    try {
      setParseError(null);
      return { ...form, priority: Number(form.priority), condition: JSON.parse(form.condition), actions: JSON.parse(form.actions) };
    } catch (e) {
      setParseError(`The condition or actions are not valid JSON (${(e as Error).message}).`);
      return null;
    }
  }
  const validate = useAct(() => { const p = payload(); if (!p) return Promise.reject(new Error("Fix the JSON first.")); return pb.post("/rules/validate", p); }, () => "The rule is valid.");
  const save = useAct(
    () => { const p = payload(); if (!p) return Promise.reject(new Error("Fix the JSON first.")); return editing ? pb.put(`/rules/${editing.id}`, p) : pb.post("/rules", p); },
    () => { setForm(null); setEditing(null); return "Rule saved as a draft. Someone else must activate it."; },
  );
  const activateAll = useAct(() => pb.post<{ activated: number; skipped: { code: string; reason: string }[] }>("/rules/activate-all", {}), (x) => `${x.activated} rule(s) activated.${x.skipped.length ? ` ${x.skipped.length} skipped (${x.skipped.map((s) => s.code).join(", ")}).` : ""}`);
  const act = useAct((a: { id: number; action: "activate" | "retire" }) => pb.post(`/rules/${a.id}/${a.action}`), () => "Done.");

  function open(r: Rule | null) {
    setEditing(r);
    setParseError(null);
    setForm(r ? { code: r.code, name: r.name, description: r.description ?? "", priority: String(r.priority), condition: JSON.stringify(r.condition, null, 2), actions: JSON.stringify(r.actions, null, 2) } : NEW_RULE);
  }

  return (
    <PbLayout
      title="Rules"
      intro="Rules choose which wordings, limits and required details a policy picks up. They are data, checked against the variable list and the wording codes before they are saved, and a rule needs a second person to go live."
      actions={<>{can("policy_bank.approve") && (list.data?.rules ?? []).some((x) => x.status === "Draft") && <button type="button" className="btn-secondary btn" disabled={activateAll.isPending} onClick={async () => { if (await confirmDialog("Activate every draft rule that you did not write yourself?")) activateAll.mutate(undefined); }}>Activate all draft rules</button>}{can("policy_bank.create") && <button type="button" className="btn" onClick={() => open(null)}>+ New rule</button>}</>}
    >
      <Flash error={save.error ?? act.error ?? validate.error ?? activateAll.error ?? parseError} ok={save.ok ?? act.ok ?? validate.ok ?? activateAll.ok} />
      {form && (
        <div className="card">
          <h2 className="card-title">{editing ? `Edit ${editing.code}` : "New rule"}</h2>
          {editing?.status === "Active" && <p className="pb-warn">This rule is live. Saving a change sends it back to Draft until someone else approves it again.</p>}
          <div className="form-grid">
            <Field label="Code"><input className="form-control" disabled={!!editing} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name"><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Priority" hint="Lower runs first."><input type="number" className="form-control" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
          </div>
          <Field label="Description"><input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Condition (JSON)" hint='Tests: {"var","op","value"}. Combine with "all", "any" or "not".'><textarea className="pb-json form-control" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} /></Field>
            <Field label="Actions (JSON list)" hint="add_component, remove_component, add_limit, require_variable, require_component, allow_removal"><textarea className="pb-json form-control" value={form.actions} onChange={(e) => setForm({ ...form, actions: e.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary btn" onClick={() => validate.mutate(undefined)}>Check</button>
            <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</button>
            <button type="button" className="btn-secondary btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="toolbar">
        <input type="search" placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option>Draft</option><option>Active</option><option>Retired</option></select>
      </div>
      <div className="card pb-table-wrap">
        <table>
          <thead><tr><th>Rule</th><th>When</th><th>Then</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={5}>Loading…</td></tr>}
            {(list.data?.rules ?? []).map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong><div className="pb-code pb-muted">{r.code} · priority {r.priority}</div></td>
                <td style={{ maxWidth: "20rem" }}>{describe(r.condition)}</td>
                <td><ul className="pb-list">{r.actions.map((a, i) => <li key={i}>{describeAction(a)}</li>)}</ul></td>
                <td><PbStatus status={r.status} /><div className="pb-muted" style={{ fontSize: "0.75rem" }}>{r.approved_by ? `approved by ${r.approved_by}` : `by ${r.created_by ?? "—"}`}</div></td>
                <td>
                  <div className="pb-row-actions">
                    {r.status !== "Retired" && can("policy_bank.edit") && <button type="button" className="btn-secondary btn" onClick={() => open(r)}>Edit</button>}
                    {r.status === "Draft" && can("policy_bank.approve") && <button type="button" className="btn" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "activate" })}>Activate</button>}
                    {r.status !== "Retired" && can("policy_bank.deactivate") && <button type="button" className="btn-secondary btn" onClick={() => act.mutate({ id: r.id, action: "retire" })}>Retire</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PbLayout>
  );
}

import { useState } from "react";
import type { ContextVariable, Validation } from "../api/engine";

const GROUP_TITLE: Record<string, string> = {
  client: "Client", insurer: "Insurer", policy: "Policy", risk: "Risk", premium: "Premium", broker: "Broker", selection: "Other details",
};

/**
 * The details the ERP does not hold and the broker must supply (client registration number, mortgagee, settlement
 * basis, …). Values that come from the transaction are shown but cannot be edited here: fix them on the transaction.
 */
// Details that are always worth offering: the parties with an interest in the property and the basis of settlement.
const ALWAYS = /^(mortgagee|loss_payee|additional_insured|input)\./;

export function PolicyDetailsForm({ variables, inputs, validation, usedKeys, onChange, readOnly = false }: {
  variables: ContextVariable[]; inputs: Record<string, string>; validation: Validation | undefined; usedKeys: Set<string>; onChange: (key: string, value: string) => void; readOnly?: boolean;
}) {
  const [showErp, setShowErp] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const needed = new Set([...(validation?.unresolved ?? []).map((u) => u.key)]);
  // A dependency error names the missing detail by its label ("... the flood excess is missing."). Only those count: a
  // wording called "Governing Law and Jurisdiction" must not light up the Jurisdiction field because it is still Draft.
  for (const e of validation?.errors ?? []) {
    const message = e.message.toLowerCase();
    if (!/(missing|required|not entered)/.test(message)) continue;
    for (const v of variables) if (message.includes(v.label.toLowerCase())) needed.add(v.key);
  }
  const relevant = (v: ContextVariable) => v.required || needed.has(v.key) || usedKeys.has(v.key) || !!inputs[v.key] || ALWAYS.test(v.key);
  const allEditable = variables.filter((v) => v.editable);
  const editable = showAll ? allEditable : allEditable.filter(relevant);
  const fromErp = variables.filter((v) => !v.editable && v.value !== null && v.entity !== "derived");
  const groups = new Map<string, ContextVariable[]>();
  for (const v of editable) groups.set(v.entity, [...(groups.get(v.entity) ?? []), v]);

  return (
    <div className="card">
      <h3 className="card-title">Details for this policy</h3>
      <p className="pb-muted">Fill in what the transaction does not hold. Highlighted fields are needed by the wording you have chosen.</p>
      {[...groups.entries()].map(([entity, vars]) => (
        <fieldset key={entity} className="pb-fieldset">
          <legend>{GROUP_TITLE[entity] ?? entity}</legend>
          <div className="form-grid">
            {vars.map((v) => {
              const typed = inputs[v.key] ?? (v.source === "input" && v.value ? v.value : "");
              const flag = needed.has(v.key) && !typed;
              return (
                <div className={`form-group${flag ? " pb-needed" : ""}`} key={v.key}>
                  <label className="form-label" htmlFor={`pb-var-${v.key}`}>{v.label}{v.required ? " *" : ""}</label>
                  <input
                    id={`pb-var-${v.key}`}
                    className="form-control"
                    type={v.type === "date" ? "date" : v.type === "number" || v.type === "money" ? "number" : "text"}
                    value={typed}
                    disabled={readOnly}
                    onChange={(e) => onChange(v.key, e.target.value)}
                  />
                  {v.description && <span className="pb-hint">{v.description}</span>}
                  <span className="pb-hint pb-code">{`{{${v.key}}}`}</span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p style={{ margin: "0 0 0.4rem" }}>
        <button type="button" className="pb-link" onClick={() => setShowAll(!showAll)}>{showAll ? "Show only the details this policy needs" : `Show all ${allEditable.length} optional details`}</button>
      </p>
      <button type="button" className="pb-link" onClick={() => setShowErp(!showErp)}>{showErp ? "Hide" : "Show"} the {fromErp.length} details taken from the transaction</button>
      {showErp && (
        <table style={{ marginTop: "0.5rem" }}>
          <tbody>{fromErp.map((v) => <tr key={v.key}><td className="pb-muted">{v.label}</td><td>{v.value}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

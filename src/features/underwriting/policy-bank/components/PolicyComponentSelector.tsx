import { useState } from "react";
import type { PvItem } from "../api/policyBank";
import type { Validation } from "../api/engine";

/**
 * One group of wordings (coverages, extensions, warranties, clauses, endorsements, or the standard terms).
 * A box is checked when the wording is in the policy once the rules have run. A wording a rule added is locked on
 * (change what made the rule fire instead); one a rule removed is shown unchecked with the reason.
 */
export function PolicyComponentSelector({ title, hint, items, chosen, validation, onToggle, collapsedByDefault = false, readOnly = false }: {
  title: string; hint?: string; items: PvItem[]; chosen: Set<string>; validation: Validation | undefined;
  onToggle: (code: string, on: boolean) => void; collapsedByDefault?: boolean; readOnly?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const addedBy = new Map((validation?.effective.addedByRules ?? []).map((a) => [a.code, a.rule]));
  const removedBy = new Map((validation?.effective.removedByRules ?? []).map((a) => [a.code, a.rule]));
  const problems = new Map<string, string[]>();
  for (const p of [...(validation?.errors ?? []), ...(validation?.warnings ?? [])]) if (p.component) problems.set(p.component, [...(problems.get(p.component) ?? []), p.message]);

  // On when the broker ticked it and no rule took it off, or when a rule put it there. This answers a click at once;
  // the server result only adds or removes what the rules did.
  const isOn = (code: string) => (chosen.has(code) && !removedBy.has(code)) || addedBy.has(code);
  const count = items.filter((i) => isOn(i.code)).length;

  return (
    <div className="card pb-selector">
      <button type="button" className="pb-selector-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{title}</strong>
        <span className="pb-muted">{count} of {items.length} selected</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && hint && <p className="pb-muted pb-selector-hint">{hint}</p>}
      {open && (
        <ul className="pb-selector-list">
          {items.map((i) => {
            const byRule = addedBy.get(i.code);
            const goneByRule = removedBy.get(i.code);
            const on = isOn(i.code);
            const locked = readOnly || (!!byRule && !chosen.has(i.code));
            const issues = problems.get(i.code);
            return (
              <li key={i.code} className={issues ? "has-issue" : undefined}>
                <label>
                  <input type="checkbox" checked={on} disabled={locked} onChange={(e) => onToggle(i.code, e.target.checked)} />
                  <span className="pb-selector-name">{i.name}</span>
                </label>
                <span className="pb-selector-tags">
                  {i.mandatory ? <span className="pb-tag">Mandatory</span> : null}
                  {byRule && !chosen.has(i.code) ? <span className="pb-tag pb-tag-rule" title={`Added by rule ${byRule}`}>Added by rule</span> : null}
                  {goneByRule ? <span className="pb-tag pb-tag-off" title={`Removed by rule ${goneByRule}`}>Removed by rule</span> : null}
                  {i.approval_status !== "Approved" ? <span className="pb-tag pb-tag-warn">{i.approval_status === "UnderReview" ? "Under review" : i.approval_status}</span> : null}
                  <button type="button" className="pb-link" onClick={() => setShown((s) => { const n = new Set(s); if (n.has(i.code)) n.delete(i.code); else n.add(i.code); return n; })}>
                    {shown.has(i.code) ? "Hide wording" : "Wording"}
                  </button>
                </span>
                {shown.has(i.code) && <pre className="pb-wording">{i.wording}</pre>}
                {issues?.map((m) => <div key={m} className="pb-issue">{m}</div>)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

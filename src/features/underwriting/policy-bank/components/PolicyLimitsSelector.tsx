import type { PvLimit } from "../api/policyBank";
import type { LimitChoice, Validation } from "../api/engine";

const KINDS = [["limit", "Limits"], ["sub_limit", "Sub-limits"], ["excess", "Excesses and deductibles"]] as const;

function valueText(l: PvLimit) {
  if (l.basis === "as_scheduled") return "As scheduled";
  if (l.percentage !== null && l.minimum_amount !== null) return `${l.percentage}% (minimum ${l.currency} ${l.minimum_amount.toLocaleString("en-NG")})`;
  if (l.percentage !== null) return `${l.percentage}%`;
  return l.amount === null ? "To be agreed" : l.amount === 0 && l.kind === "excess" ? "Nil" : `${l.currency} ${l.amount.toLocaleString("en-NG")}`;
}

/** Limits, sub-limits and excesses: tick the ones that apply and adjust their figures for this policy. */
export function PolicyLimitsSelector({ limits, chosen, overrides, validation, onToggle, onOverride, readOnly = false }: {
  limits: PvLimit[]; chosen: Set<string>; overrides: Map<string, LimitChoice>; validation: Validation | undefined;
  onToggle: (code: string, on: boolean) => void; onOverride: (code: string, patch: Partial<LimitChoice>) => void; readOnly?: boolean;
}) {
  const addedBy = new Map((validation?.effective.limitsAddedByRules ?? []).map((a) => [a.code, a.rule]));
  return (
    <>
      {KINDS.map(([kind, title]) => {
        const rows = limits.filter((l) => l.kind === kind);
        if (!rows.length) return null;
        return (
          <div className="card pb-selector" key={kind}>
            <div className="pb-selector-head" style={{ cursor: "default" }}><strong>{title}</strong></div>
            <ul className="pb-selector-list">
              {rows.map((l) => {
                const byRule = addedBy.get(l.code);
                const on = chosen.has(l.code) || !!byRule;
                const o = overrides.get(l.code) ?? { code: l.code };
                return (
                  <li key={l.code}>
                    <label>
                      <input type="checkbox" checked={on} disabled={readOnly || (!!byRule && !chosen.has(l.code))} onChange={(e) => onToggle(l.code, e.target.checked)} />
                      <span className="pb-selector-name">{l.name}</span>
                    </label>
                    <span className="pb-selector-tags">
                      {byRule && !chosen.has(l.code) ? <span className="pb-tag pb-tag-rule" title={`Added by rule ${byRule}`}>Added by rule</span> : null}
                      <span className="pb-muted">{valueText(l)}</span>
                    </span>
                    {on && !readOnly && l.basis !== "as_scheduled" && (
                      <div className="pb-limit-edit">
                        {l.percentage !== null && (
                          <label>% <input type="number" min={0} max={100} className="form-control" value={o.percentage ?? l.percentage ?? ""} onChange={(e) => onOverride(l.code, { percentage: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                        )}
                        {(l.amount !== null || l.percentage === null) && (
                          <label>Amount <input type="number" min={0} className="form-control" value={o.amount ?? l.amount ?? ""} onChange={(e) => onOverride(l.code, { amount: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                        )}
                        {l.minimum_amount !== null && (
                          <label>Minimum <input type="number" min={0} className="form-control" value={o.minimum_amount ?? l.minimum_amount ?? ""} onChange={(e) => onOverride(l.code, { minimum_amount: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

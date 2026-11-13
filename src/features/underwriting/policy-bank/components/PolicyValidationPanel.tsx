import type { Validation } from "../api/engine";

const ICON = { pass: "✓", warn: "!", fail: "✗" } as const;
const BANNER = {
  READY: { text: "READY FOR APPROVAL", cls: "ok" },
  READY_WITH_WARNINGS: { text: "READY FOR APPROVAL, WITH WARNINGS", cls: "warn" },
  CANNOT_GENERATE: { text: "POLICY CANNOT BE GENERATED", cls: "bad" },
} as const;

/** The result of validation as the broker reads it: a status, the checklist, and the numbered problems to fix. */
export function PolicyValidationPanel({ validation, isFetching, emptyText }: { validation: Validation | undefined; isFetching: boolean; emptyText?: string }) {
  if (!validation) return <div className="card pb-validation"><p className="pb-muted">{emptyText ?? "Checking the policy…"}</p></div>;
  const banner = BANNER[validation.status];
  return (
    <div className="card pb-validation" aria-busy={isFetching}>
      <div className={`pb-banner pb-banner-${banner.cls}`}>
        <strong>{banner.text}</strong>
        {isFetching && <span className="pb-muted"> · checking…</span>}
      </div>
      <ul className="pb-checks">
        {validation.checks.map((c) => (
          <li key={c.key} className={`pb-check pb-check-${c.status}`}>
            <span className="pb-check-icon" aria-hidden="true">{ICON[c.status]}</span>
            <span><span className="sr-only">{c.status === "pass" ? "Passed: " : c.status === "warn" ? "Warning: " : "Failed: "}</span>{c.label}</span>
          </li>
        ))}
      </ul>
      {validation.errors.length > 0 && (
        <>
          <h4>Fix these first</h4>
          <ol className="pb-problems">{validation.errors.map((e, i) => <li key={`${e.message}-${i}`}>{e.message}</li>)}</ol>
        </>
      )}
      {validation.warnings.length > 0 && (
        <>
          <h4>Warnings</h4>
          <ul className="pb-problems pb-problems-warn">{validation.warnings.map((e, i) => <li key={`${e.message}-${i}`}>{e.message}</li>)}</ul>
        </>
      )}
      {(validation.effective.addedByRules.length > 0 || validation.effective.removedByRules.length > 0 || validation.effective.limitsAddedByRules.length > 0) && (
        <>
          <h4>Added or removed by the rules</h4>
          <ul className="pb-problems">
            {validation.effective.addedByRules.map((a) => <li key={`a-${a.code}`}>Added {a.code} <span className="pb-muted">({a.rule})</span></li>)}
            {validation.effective.limitsAddedByRules.map((a) => <li key={`l-${a.code}`}>Added {a.code} <span className="pb-muted">({a.rule})</span></li>)}
            {validation.effective.removedByRules.map((a) => <li key={`r-${a.code}`}>Removed {a.code} <span className="pb-muted">({a.rule})</span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

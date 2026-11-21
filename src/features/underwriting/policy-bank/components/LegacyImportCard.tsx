import { useState } from "react";
import { pb, usePbAccess } from "../api/policyBank";
import { Flash, useAct } from "./PbCommon";
import { confirmDialog } from "@/shared/components/Dialogs";

interface ImportResult {
  dryRun: boolean; considered: number; imported: number; alreadyImported: number; skippedRetired: number; skippedEmpty: number; insurerSpecific: number;
  needsAttention: { code: string; legacyCode: string; unknownVariables: string[] }[]; codes: string[];
}

/**
 * Brings the wordings already in the Clause Library (used on broking slips) into the Policy Bank as drafts to review.
 * It only reads the library, so slips are unaffected. Always shows what would happen before anything is written.
 */
export function LegacyImportCard() {
  const { can } = usePbAccess();
  const [open, setOpen] = useState(false);
  const preview = useAct(() => pb.post<ImportResult>("/import/legacy-clauses", { dryRun: true }), () => "");
  const run = useAct(() => pb.post<ImportResult>("/import/legacy-clauses", { dryRun: false }), (r) => `${r.imported} wording(s) imported as drafts.`);
  if (!can("policy_bank.create")) return null;
  const p = run.data ?? preview.data;
  return (
    <div className="card">
      <div className="pb-row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong>Import from the Clause Library</strong>
        <button type="button" className="btn-secondary btn" onClick={() => { setOpen(!open); if (!open && !preview.data) preview.mutate(undefined); }}>{open ? "Close" : "Review what can be imported"}</button>
      </div>
      {open && (
        <div style={{ marginTop: "0.8rem" }}>
          <p className="pb-muted">
            The Clause Library holds the wordings used on broking slips. Importing copies them into the Policy Bank as <strong>drafts</strong> so they can be reviewed, approved and put into products.
            Nothing in the library changes, and slips keep working as before.
          </p>
          <Flash error={preview.error ?? run.error} ok={run.ok} />
          {preview.isPending && <p>Checking the library…</p>}
          {p && (
            <>
              <ul className="pb-list">
                <li><strong>{p.imported}</strong> {p.dryRun ? "can be imported" : "imported"}{p.insurerSpecific ? ` (${p.insurerSpecific} are specific to one insurer)` : ""}</li>
                <li>{p.alreadyImported} already in the Policy Bank</li>
                <li>{p.skippedRetired} retired in the library (not imported)</li>
                {p.skippedEmpty > 0 && <li>{p.skippedEmpty} have no wording (not imported)</li>}
              </ul>
              {p.needsAttention.length > 0 && (
                <div className="flash flash-warning">
                  {p.needsAttention.length} wording(s) use placeholders the Policy Bank does not know, such as <span className="pb-code">{`{{${p.needsAttention[0].unknownVariables[0]}}}`}</span>.
                  They are imported, but each must be edited to use a known variable before it can be submitted for approval.
                </div>
              )}
              {p.dryRun && p.imported > 0 && (
                <button type="button" className="btn" disabled={run.isPending} onClick={async () => { if (await confirmDialog(`Import ${p.imported} wording(s) as drafts?`)) run.mutate(undefined); }}>
                  {run.isPending ? "Importing…" : `Import ${p.imported} wording(s) as drafts`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

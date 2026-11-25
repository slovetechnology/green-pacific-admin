import { useState } from "react";
import { Modal } from "@/shared/components/exec/Modal";
import { engine, type LockSummary, type Workflow } from "../api";

// The audit-reason gatekeeper. Opens whenever someone tries to Edit, Cancel Cover, Delete an item or Void a policy
// whose credit/debit notes are posted: direct editing is locked, the user states why (structured category plus
// mandatory remarks, written to the audit log) and is routed to the workflow that changes the policy properly.

export type AttemptedAction = "EDIT" | "CANCEL_COVER" | "DELETE_ITEM" | "VOID" | "DELETE";

const ACTION_LABEL: Record<AttemptedAction, string> = {
  EDIT: "Edit", CANCEL_COVER: "Cancel cover", DELETE_ITEM: "Delete item", VOID: "Void", DELETE: "Delete",
};

// The category each attempted action most likely means, pre-selected.
const DEFAULT_FOR: Record<AttemptedAction, Workflow> = {
  EDIT: "ENDORSEMENT", CANCEL_COVER: "MTC_CANCELLATION", DELETE_ITEM: "ITEM_REMOVAL", VOID: "ERROR_REVERSAL", DELETE: "ERROR_REVERSAL",
};

const HINT: Record<Workflow, string> = {
  MTC_CANCELLATION: "Pro-rata or short-rate return premium, commission clawback, RP debit note to the insurer and RP credit note to the client.",
  ITEM_REMOVAL: "Marks the vehicle / building / person as removed (never deleted) and returns its unexpired premium.",
  ERROR_REVERSAL: "Supervisor-approved 100% contra of the notes, then a corrected draft copy to re-issue with new numbers.",
  OVERPAYMENT_REFUND: "Refund, carry forward or apply the client's credit (overpayments and return premiums).",
  ENDORSEMENT: "Additional premium, sum insured or subject-matter change, booked as an endorsement note.",
  NON_FINANCIAL_EDIT: "Narration, subject matter, policy or slip number. Premium, dates, insurer and schedule stay locked.",
};

export function ModificationReasonModal({
  open, txId, action, lock, activeItems = 0, onClose, onRoute,
}: {
  open: boolean;
  txId: number;
  action: AttemptedAction;
  lock: LockSummary;
  /** Live schedule items: removing one needs at least two (the last one is a cancellation). */
  activeItems?: number;
  onClose: () => void;
  onRoute: (category: Workflow, remarks: string) => void;
}) {
  const options = (Object.keys(lock.categories) as Workflow[]).filter((w) => lock.allowedWorkflows.includes(w) && (w !== "ITEM_REMOVAL" || activeItems > 1));
  const preferred = options.includes(DEFAULT_FOR[action]) ? DEFAULT_FOR[action] : options[0];
  const [category, setCategory] = useState<Workflow | undefined>(preferred);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!category) return setError("Choose why you are modifying this policy.");
    if (remarks.trim().length < 10) return setError("Give detailed remarks (at least 10 characters). They go on the audit trail.");
    setBusy(true);
    try {
      await engine.intent(txId, { category, remarks: remarks.trim(), action_attempted: action });
      onRoute(category, remarks.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the reason.");
    } finally {
      setBusy(false);
    }
  }

  const notes = lock.notes.filter((n) => n.note_type === "CREDIT_NOTE" || n.note_type === "DEBIT_NOTE").map((n) => n.note_no).join(", ");

  return (
    <Modal
      open={open}
      wide
      title="Why are you modifying this posted policy?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={busy || !category}>Continue</button>
        </>
      }
    >
      <div className="ee-lock-note" role="note">
        <span aria-hidden="true">🔒</span>
        <span>
          You chose <strong>{ACTION_LABEL[action]}</strong>. Its notes{notes ? ` (${notes})` : ""} are posted, so direct editing of the
          premium, dates, insurer and schedule is locked. Every change is a new, linked document.
        </span>
      </div>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {options.length === 0 ? (
        <p>This policy can't be modified any further (it is cancelled or reversed).</p>
      ) : (
        <fieldset className="ee-reasons" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ee-sr-only">Modification category</legend>
          {options.map((w) => (
            <label key={w} className={`ee-reason${category === w ? " is-selected" : ""}`}>
              <input type="radio" name="ee-category" value={w} checked={category === w} onChange={() => setCategory(w)} />
              <span>
                <strong>{lock.categories[w]}</strong>
                <small>{HINT[w]}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor="ee-remarks">Detailed remarks (required)</label>
        <textarea id="ee-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Client sold the vehicle on 12 Nov; insurer notified by email." />
      </div>
    </Modal>
  );
}

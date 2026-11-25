// The checker's side of the maker-checker queue, shared by the policy page banner and the approvals tab. A pending
// request is either an error reversal or a non-payment write-off; each asks the approver what it needs.
import { alertDialog, confirmDialog, promptDialog } from "@/shared/components/Dialogs";
import { engine, fmtKobo, WORKFLOW_LABEL, type EndorsementDetail, type EndorsementRow } from "./api";

/** Approves after confirming. Returns the posted result, or null when the approver backed out. */
export async function approvePending(row: EndorsementRow): Promise<EndorsementDetail | null> {
  if (row.endorsement_type !== "NON_PAYMENT_WRITE_OFF") {
    if (!(await confirmDialog("Approve this reversal? The notes are contra-reversed and the policy voided."))) return null;
    return await engine.approve(row.id);
  }
  const amount = fmtKobo(row.gross_rp);
  const badDebt = fmtKobo(row.bad_debt_cents);
  if (row.write_off_route === "BROKER_ABSORBS") {
    const reference = await promptDialog({
      title: "Approve write-off: broker absorbs the bad debt",
      message: `The unpaid ${amount} is cancelled from inception, and the ${badDebt} already paid to the insurer is written off as the broker's bad debt. `
        + `First move ${badDebt} from the operating account into the client premium trust account, then enter that transfer's reference.`,
      label: "Trust top-up transfer reference",
      required: true,
      confirmLabel: "Approve and post",
    });
    if (!reference) return null;
    return await engine.approve(row.id, { trust_topup_reference: reference.trim() });
  }
  const message = row.write_off_route === "RECOVER_FROM_INSURER"
    ? `The unpaid ${amount} is cancelled from inception and the policy closed. The premium already paid to the insurer goes on the "Insurer RP refunds due" list to recover.`
    : `The unpaid ${amount} is cancelled from inception and the policy closed. Nothing was paid to the insurer for it, so nothing posts to the ledger.`;
  if (!(await confirmDialog({ title: "Approve write-off for non-payment?", message, confirmLabel: "Approve and post" }))) return null;
  return await engine.approve(row.id);
}

/** Rejects after asking why. Returns true when rejected. */
export async function rejectPending(row: EndorsementRow): Promise<boolean> {
  const what = row.endorsement_type === "NON_PAYMENT_WRITE_OFF" ? "write-off" : "reversal";
  const reason = await promptDialog({ message: `Why reject this ${what}?`, required: true, multiline: true });
  if (!reason) return false;
  await engine.reject(row.id, reason);
  return true;
}

/** What to tell the approver once a request has posted. */
export function approvedMessage(row: EndorsementRow, result: EndorsementDetail): { title: string; message: string } {
  const journal = result.journal ? (result.journal.posted ? ` GL journal ${result.journal.journalNo} posted.` : ` Ledger: ${result.journal.reason}`) : "";
  if (row.endorsement_type === "NON_PAYMENT_WRITE_OFF") {
    return { title: `${WORKFLOW_LABEL.NON_PAYMENT_WRITE_OFF} posted`, message: `${result.endorsement_number}: the policy is closed.${journal}` };
  }
  return {
    title: "Reversal posted",
    message: result.cloneId ? `A corrected draft copy was opened as policy #${result.cloneId}.` : result.cloneError ? `The corrected draft could not be created: ${result.cloneError}` : `Done.${journal}`,
  };
}

export const showError = (err: unknown, fallback: string) => void alertDialog(err instanceof Error ? err.message : fallback);

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
  const what = writeOffSummary(row);
  if (Number(row.bad_debt_cents) > 0) {
    const badDebt = fmtKobo(row.bad_debt_cents);
    const reference = await promptDialog({
      title: "Approve write-off: the broker bears a bad debt",
      message: `${what} The broker's bad debt is ${badDebt}. `
        + `First move ${badDebt} from the operating account into the client premium trust account, then enter that transfer's reference.`,
      label: "Trust top-up transfer reference",
      required: true,
      confirmLabel: "Approve and post",
    });
    if (!reference) return null;
    return await engine.approve(row.id, { trust_topup_reference: reference.trim() });
  }
  const message = `${what} ${row.write_off_route === "RECOVER_FROM_INSURER"
    ? "The premium already paid to the insurer goes on the \"Insurer RP refunds due\" list to recover."
    : "Nothing is lost by the broker, so nothing posts to the ledger."}`;
  if (!(await confirmDialog({ title: "Approve write-off for non-payment?", message, confirmLabel: "Approve and post" }))) return null;
  return await engine.approve(row.id);
}

/** One-line account of a write-off: how far the cover ran, what is cancelled, and any shortfall. */
export function writeOffSummary(row: EndorsementRow): string {
  const shortfall = Number(row.shortfall_cents) || 0;
  const cover = row.time_on_risk_basis === "ON_RISK" ? `The insurer kept the cover on to ${row.cover_end_date}.` : `The cover ran only as far as the payments: to ${row.cover_end_date}.`;
  const unpaid = `The unpaid ${fmtKobo(row.gross_rp)} is written off and the policy closed.`;
  if (!shortfall) return `${cover} ${unpaid}`;
  return `${cover} ${unpaid} Of it, ${fmtKobo(shortfall)} was earned by the insurer: ${row.shortfall_route === "BROKER_BEARS" ? "the broker pays the insurer its net share" : "the insurer bears it"}.`;
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

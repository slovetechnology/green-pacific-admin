import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGate } from "@/app/guards/RoleGate";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { alertDialog, confirmDialog, promptDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/endorsement-engine.css";
import { engine, fmtKobo, WORKFLOW_LABEL, type EndorsementDetail, type Workflow } from "./api";
import { ModificationReasonModal, type AttemptedAction } from "./components/ModificationReasonModal";
import { ReturnPremiumWizard } from "./components/ReturnPremiumWizard";
import { ReversalRequestModal } from "./components/ReversalRequestModal";
import { OverpaymentAllocationModal } from "./components/OverpaymentAllocationModal";

// Wires a policy page to the engine. `attempt(action)` is what the Edit / Cancel Cover / Delete Item / Void /
// Delete buttons call: on a draft policy it does the plain thing (`onDirect`), on a posted one it opens the
// Modification Reason modal and routes to the right workflow. `ui` renders the lock banner and the modals.

type Item = { id: number; label: string; value: number; removed?: boolean };

export function usePolicyModification({
  txId, clientId, items, onDirect, onShowEndorsements,
}: {
  txId: number;
  clientId: number;
  items: Item[];
  /** Draft (unposted) policy: what the button does without the engine. */
  onDirect: (action: AttemptedAction) => void;
  onShowEndorsements: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: lock, refetch } = useQuery({ queryKey: ["engine", "lock", txId], queryFn: () => engine.lock(txId), enabled: Number.isFinite(txId) });
  const [action, setAction] = useState<AttemptedAction | null>(null);
  const [route, setRoute] = useState<{ category: Workflow; remarks: string } | null>(null);

  const refreshAll = () => Promise.all([
    refetch(),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["engine"] }),
  ]);

  function attempt(a: AttemptedAction) {
    if (!lock || !lock.locked) return onDirect(a);
    setAction(a);
  }

  function onRoute(category: Workflow, remarks: string) {
    setAction(null);
    if (category === "NON_FINANCIAL_EDIT") return navigate(`/transactions/${txId}/edit?mode=non-financial`);
    if (category === "ENDORSEMENT") return onShowEndorsements();
    setRoute({ category, remarks });
  }

  async function done(result: EndorsementDetail, what: string) {
    setRoute(null);
    await refreshAll();
    const journal = result.journal ? (result.journal.posted ? ` GL journal ${result.journal.journalNo} posted.` : ` Ledger: ${result.journal.reason}`) : "";
    void alertDialog({ title: what, message: `${result.endorsement_number} — ${result.status === "PENDING_APPROVAL" ? "waiting for supervisor approval" : "posted"}.${journal}` });
  }

  async function postNotes() {
    if (!(await confirmDialog("Issue (post) this policy's credit and debit notes? Their figures are frozen from then on; changes go through endorsements or reversal."))) return;
    try {
      await engine.postNotes(txId);
      await refreshAll();
    } catch (err) {
      void alertDialog(err instanceof Error ? err.message : "Could not post the notes.");
    }
  }

  async function decide(id: number, approve: boolean) {
    try {
      if (approve) {
        if (!(await confirmDialog("Approve this reversal? The notes are contra-reversed and the policy voided."))) return;
        const r = await engine.approve(id);
        await refreshAll();
        if (r.cloneId) {
          void alertDialog({ title: "Reversal posted", message: `A corrected draft copy was opened as policy #${r.cloneId}. Fix the mistake there and post its notes.` });
          navigate(`/transactions/${r.cloneId}/edit`);
        } else {
          void alertDialog({ title: "Reversal posted", message: r.cloneError ? `The corrected draft could not be created: ${r.cloneError}` : "Done." });
        }
      } else {
        const reason = await promptDialog({ message: "Why reject this reversal?", required: true, multiline: true });
        if (!reason) return;
        await engine.reject(id, reason);
        await refreshAll();
      }
    } catch (err) {
      void alertDialog(err instanceof Error ? err.message : "Could not record the decision.");
    }
  }

  const notesText = lock?.notes.filter((n) => n.note_type === "CREDIT_NOTE" || n.note_type === "DEBIT_NOTE").map((n) => `${n.note_no} (${n.status.toLowerCase().replace(/_/g, " ")})`).join(" · ");

  const ui: ReactNode = lock ? (
    <>
      {lock.coverCancelled ? (
        <div className="ee-banner is-cancelled" role="status">
          <strong>{WORKFLOW_LABEL[lock.coverCancelled.endorsement_type]}</strong>
          <span>{lock.coverCancelled.endorsement_number} effective {lock.coverCancelled.effective_date} · return premium {fmtKobo(lock.coverCancelled.gross_rp)}</span>
        </div>
      ) : lock.locked ? (
        <div className="ee-banner" role="status">
          <span aria-hidden="true">🔒</span>
          <strong>Posted &amp; locked</strong>
          <span>{notesText}</span>
          {!lock.isEndorsementNote && (
            <span className={`ee-chip ${lock.remittanceStatus === "REMITTED" ? "is-warn" : "is-ok"}`}>
              {lock.remittanceStatus === "REMITTED" ? "REMITTED (Requires Insurer Refund)" : "UNREMITTED (Can Offset)"}
            </span>
          )}
          {lock.claims.blocked && <span className="ee-chip is-crit" title={lock.claims.message || ""}>Claim history</span>}
          <span className="ee-spacer" />
          <RoleGate need="write">
            {!lock.isEndorsementNote && lock.allowedWorkflows.includes("MTC_CANCELLATION") && (
              <>
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => attempt("CANCEL_COVER")}>Cancel cover</button>
                {items.filter((i) => !i.removed).length > 1 && <button type="button" className="btn-secondary btn btn-sm" onClick={() => attempt("DELETE_ITEM")}>Remove item</button>}
                <button type="button" className="btn-secondary btn btn-sm" onClick={() => attempt("VOID")}>Void (entry in error)</button>
              </>
            )}
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setRoute({ category: "OVERPAYMENT_REFUND", remarks: "" })}>Client credit</button>
          </RoleGate>
        </div>
      ) : (
        <div className="ee-banner is-draft" role="status">
          <strong>Draft notes</strong>
          <span>This policy's credit and debit notes aren't posted yet, so it can still be edited directly.</span>
          <span className="ee-spacer" />
          {!lock.isEndorsementNote && <RoleGate need="write"><button type="button" className="btn btn-sm" onClick={postNotes}>Post &amp; lock notes</button></RoleGate>}
        </div>
      )}

      {lock.pendingApprovals.map((p) => (
        <div key={p.id} className="ee-banner is-draft" role="status">
          <strong>Pending approval</strong>
          <span>{WORKFLOW_LABEL[p.endorsement_type]} {p.endorsement_number}, requested by {p.created_by}: {p.audit_notes}</span>
          <span className="ee-spacer" />
          {user?.isAdmin && user.username !== p.created_by ? (
            <>
              <button type="button" className="btn btn-sm" onClick={() => decide(p.id, true)}>Approve</button>
              <button type="button" className="btn-danger btn btn-sm" onClick={() => decide(p.id, false)}>Reject</button>
            </>
          ) : <span className="muted">A different supervisor must approve. <Link to="/refund-vouchers?tab=approvals">Approvals queue</Link></span>}
        </div>
      ))}

      {action && (
        <ModificationReasonModal open txId={txId} action={action} lock={lock} activeItems={items.filter((i) => !i.removed).length} onClose={() => setAction(null)} onRoute={onRoute} />
      )}
      {route && (route.category === "MTC_CANCELLATION" || route.category === "ITEM_REMOVAL") && (
        <ReturnPremiumWizard open txId={txId} type={route.category} lock={lock} items={items} initialRemarks={route.remarks}
          onClose={() => setRoute(null)} onDone={(r) => done(r, `${WORKFLOW_LABEL[route.category]} posted`)} />
      )}
      {route?.category === "ERROR_REVERSAL" && (
        <ReversalRequestModal open txId={txId} lock={lock} initialRemarks={route.remarks} onClose={() => setRoute(null)}
          onDone={(r) => done(r, "Reversal requested")} />
      )}
      {route?.category === "OVERPAYMENT_REFUND" && (
        <OverpaymentAllocationModal open clientId={clientId} onClose={() => setRoute(null)} onDone={() => void refreshAll()} />
      )}
    </>
  ) : null;

  return { lock, attempt, ui };
}

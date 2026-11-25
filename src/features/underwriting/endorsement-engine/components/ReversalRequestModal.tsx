import { useState } from "react";
import { Modal } from "@/shared/components/exec/Modal";
import { engine, fmtKobo, humanize, type EndorsementDetail, type LockSummary } from "../api";

// Scenario 3, maker step: request a contra reversal of a policy entered in error. A supervisor (a different user)
// approves it; the notes are mirrored 100%, the policy is voided, premium already received becomes client credit,
// and a corrected draft copy opens so the user fixes the mistake without retyping it.
export function ReversalRequestModal({
  open, txId, lock, initialRemarks, onClose, onDone,
}: {
  open: boolean;
  txId: number;
  lock: LockSummary;
  initialRemarks: string;
  onClose: () => void;
  onDone: (result: EndorsementDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState(initialRemarks);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cn = lock.notes.find((n) => n.note_type === "CREDIT_NOTE");
  const dn = lock.notes.find((n) => n.note_type === "DEBIT_NOTE");

  async function submit() {
    setError(null);
    if (!reason) return setError("Choose what was wrong with the entry.");
    if (remarks.trim().length < 10) return setError("Describe the error (at least 10 characters).");
    setBusy(true);
    try {
      onDone(await engine.requestReversal(txId, { reason_code: reason, remarks: remarks.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request the reversal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title="Reverse transaction entered in error"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={busy}>Submit for supervisor approval</button>
        </>
      }
    >
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {lock.remittanceStatus === "REMITTED" && (
        <div className="ee-claims" role="alert">The insurer already holds the net premium on this credit note. Use a mid-term cancellation instead.</div>
      )}
      <div className="ee-docs">
        {[cn, dn].filter(Boolean).map((n) => (
          <section key={n!.id} className="ee-doc">
            <header><h4>Contra of {n!.note_no}</h4><span className="ee-chip is-crit">will be REVERSED</span></header>
            <dl>
              <dt>Gross premium</dt><dd>-{fmtKobo(n!.gross_premium_cents)}</dd>
              {n!.party === "INSURER" && <><dt>Commission</dt><dd>-{fmtKobo(n!.commission_cents)}</dd></>}
              <dt className="ee-total">Amount</dt><dd className="ee-total">-{fmtKobo(n!.amount_due_cents)}</dd>
            </dl>
          </section>
        ))}
      </div>
      <div className="field">
        <label htmlFor="ee-rev-reason">What was wrong?</label>
        <select id="ee-rev-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose…</option>
          {(lock.reasonCodes.ERROR_REVERSAL || []).map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ee-rev-remarks">Remarks</label>
        <textarea id="ee-rev-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
      <p className="muted">Dual control: a supervisor other than you must approve. On approval, a draft copy opens with new note numbers for you to correct and post.</p>
    </Modal>
  );
}

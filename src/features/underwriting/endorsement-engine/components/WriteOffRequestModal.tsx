import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Modal } from "@/shared/components/exec/Modal";
import { engine, fmtKobo, WRITE_OFF_ROUTE_LABEL, type EndorsementDetail, type WriteOffRoute } from "../api";

// Maker step of "Cancel / write off for non-payment": an expired policy the client never (fully) paid for.
// Under No Premium, No Cover the unpaid premium is cancelled from inception: the client's RP credit note offsets
// what they owe, the insurer's RP debit note cancels its share and the unearned brokerage goes too. Only premium
// already paid to the insurer for the unpaid part is at stake; the maker proposes whether to recover it from the
// insurer or absorb it as a bad debt, and a different supervisor approves.
export function WriteOffRequestModal({
  open, txId, initialRemarks, onClose, onDone,
}: {
  open: boolean;
  txId: number;
  initialRemarks: string;
  onClose: () => void;
  onDone: (result: EndorsementDetail) => void;
}) {
  const [route, setRoute] = useState<WriteOffRoute | null>(null);
  const [remarks, setRemarks] = useState(initialRemarks);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-worked on the server (the same code that posts) whenever the route changes.
  const { data: preview, error: queryError, isFetching: loading } = useQuery({
    queryKey: ["engine", "write-off-preview", txId, route],
    queryFn: () => engine.previewWriteOff(txId, route && route !== "NONE" ? { route } : {}),
    enabled: open, placeholderData: keepPreviousData, retry: false, gcTime: 0,
  });
  const loadError = queryError ? (queryError instanceof Error ? queryError.message : "Could not work out the write-off.") : null;

  const c = preview?.calc;
  const exposed = Boolean(c && c.insurerExposure > 0);
  const blocked = Boolean(preview?.claims.blocked);
  // The route shown: none when nothing went to the insurer, else what the maker picked (null until they do).
  const shown: WriteOffRoute | null = exposed ? route : "NONE";

  async function submit() {
    setError(null);
    if (exposed && !route) return setError("Choose how the premium already paid to the insurer is settled.");
    if (remarks.trim().length < 10) return setError("Remarks must say what happened (at least 10 characters).");
    setBusy(true);
    try {
      onDone(await engine.requestWriteOff(txId, { remarks: remarks.trim(), ...(exposed && route ? { route } : {}) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request the write-off.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      xwide
      title="Cancel / write off for non-payment"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={busy || loading || !preview || blocked}>Submit for supervisor approval</button>
        </>
      }
    >
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {loadError && !preview && <div className="ee-claims" role="alert">{loadError}</div>}
      {loading && !preview && <p className="muted" role="status">Working out the write-off…</p>}
      {preview && c && (
        <div className="ee-wizard">
          <div className="ee-form">
            <div className="ee-lock-note" role="note">
              <span>
                The cover ran {preview.policy.start_date} to {preview.policy.end_date} and has expired with {fmtKobo(c.outstanding)} unpaid.
                Under <strong>No Premium, No Cover</strong> the unpaid premium is cancelled from inception, not booked as a bad debt.
              </span>
            </div>
            {blocked && (
              <div className="ee-claims" role="alert">
                <strong>Claim history.</strong> {preview.claims.message} A policy with claims can't be written off for non-payment: settle the claim position with the insurer first.
              </div>
            )}
            {exposed ? (
              <fieldset className="ee-reasons" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ marginBottom: "0.4rem" }}>
                  <strong>{fmtKobo(c.insurerExposure)}</strong> was already paid to {preview.policy.insurer_name} for premium the client never paid. Who bears it?
                </legend>
                {(["RECOVER_FROM_INSURER", "BROKER_ABSORBS"] as const).map((r) => (
                  <label key={r} className={`ee-reason${route === r ? " is-selected" : ""}`}>
                    <input type="radio" name="ee-wo-route" value={r} checked={route === r} onChange={() => setRoute(r)} />
                    <span>
                      <strong>{WRITE_OFF_ROUTE_LABEL[r]}</strong>
                      <small>
                        {r === "RECOVER_FROM_INSURER"
                          ? "The insurer was never on risk, so it refunds the premium. The RP debit note waits on the \"Insurer RP refunds due\" list."
                          : "The insurer won't refund it (for example, it held cover on credit). It is expensed as the broker's bad debt, and the trust account is topped up from operating."}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="ee-route">
                <span className="ee-chip is-ok">Nothing at risk</span>{" "}
                {preview.policy.billing_mode === "Direct"
                  ? "Direct Bill: the insurer collects the premium itself, so the broker paid it nothing."
                  : "No premium was paid to the insurer for the unpaid part, so nothing is lost and nothing posts to the ledger."}
              </div>
            )}
            <div className="field">
              <label htmlFor="ee-wo-remarks">Remarks (audit trail)</label>
              <textarea id="ee-wo-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Three reminders sent (Aug, Sep, Oct); client confirmed in writing they won't pay." />
            </div>
            <p className="muted">Dual control: a supervisor other than you must approve. On approval the policy is closed and comes off the debtors list.</p>
          </div>

          <aside className={`ee-drawer${loading ? " is-busy" : ""}`} aria-live="polite" aria-busy={loading} aria-label="Write-off summary">
            <h3>What happens {loading && <span className="ee-chip is-info" role="status">Recalculating…</span>}</h3>
            <div className="ee-kv">
              <div><span>Premium due</span><strong>{fmtKobo(c.policyPremium)}</strong></div>
              <div><span>Paid by client (stays earned)</span><strong>{fmtKobo(c.premiumPaid)}</strong></div>
              <div><span>Unpaid, cancelled</span><strong>{fmtKobo(c.outstanding)}</strong></div>
              <div><span>{shown === "BROKER_ABSORBS" ? "Bad debt" : shown === "RECOVER_FROM_INSURER" ? "To recover from insurer" : shown === null ? "Paid to insurer, at stake" : "Loss to broker"}</span>
                <strong>{fmtKobo(shown === "BROKER_ABSORBS" ? c.badDebt : shown === null ? c.insurerExposure : c.recoverable)}</strong></div>
            </div>
            <div className="ee-docs">
              <section className="ee-doc" aria-label={preview.documents.rpDebitNote.title}>
                <header><h4>{preview.documents.rpDebitNote.title}</h4><span className="ee-chip">{shown === "RECOVER_FROM_INSURER" ? "Insurer refund due" : "Offset"}</span></header>
                <div className="muted">To {preview.documents.rpDebitNote.to} · amends {preview.documents.rpDebitNote.parent}</div>
                <dl>
                  <dt>Gross premium cancelled</dt><dd>{fmtKobo(preview.documents.rpDebitNote.gross)}</dd>
                  <dt>Less brokerage (never earned)</dt><dd>({fmtKobo(preview.documents.rpDebitNote.commission)})</dd>
                  <dt>Net premium cancelled</dt><dd>{fmtKobo(preview.documents.rpDebitNote.net)}</dd>
                  <dt className="ee-total">Cash due back from insurer</dt><dd className="ee-total">{fmtKobo(preview.documents.rpDebitNote.amountDue)}</dd>
                </dl>
              </section>
              <section className="ee-doc" aria-label={preview.documents.rpCreditNote.title}>
                <header><h4>{preview.documents.rpCreditNote.title}</h4><span className="ee-chip is-info">Client</span></header>
                <div className="muted">To {preview.documents.rpCreditNote.to} · amends {preview.documents.rpCreditNote.parent}</div>
                <dl>
                  <dt>Unpaid premium cancelled</dt><dd>{fmtKobo(preview.documents.rpCreditNote.gross)}</dd>
                  <dt className="ee-total">Offset against what they owe</dt><dd className="ee-total">{fmtKobo(preview.documents.rpCreditNote.offsetAgainstOutstanding)}</dd>
                  <dt>Cash refund</dt><dd>{fmtKobo(0)}</dd>
                </dl>
              </section>
            </div>
            <div className="ee-route">
              {shown === "NONE" && <>Ledger: nothing posts. The premium and brokerage were never booked, because the ledger books them only when the client pays.</>}
              {shown === "RECOVER_FROM_INSURER" && <>Ledger: Dr return premium receivable from insurer / Cr premium payable, {fmtKobo(c.insurerExposure)}. When the insurer pays, record it on the "Insurer RP refunds due" tab.</>}
              {shown === "BROKER_ABSORBS" && <>Ledger: Dr bad debts written off / Cr premium payable, and Dr client trust bank / Cr operating bank, {fmtKobo(c.badDebt)} each. The approver enters the transfer reference.</>}
              {shown === null && <>Choose who bears the {fmtKobo(c.insurerExposure)} to see the ledger entry.</>}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

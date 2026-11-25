import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Modal } from "@/shared/components/exec/Modal";
import {
  engine, fmtKobo, SHORTFALL_ROUTE_LABEL, WRITE_OFF_ROUTE_LABEL, type EndorsementDetail, type ShortfallRoute, type TimeOnRisk, type WriteOffChoices,
  type WriteOffRoute,
} from "../api";

// Maker step of "Cancel / write off for non-payment": an expired policy the client didn't pay for in full, either
// nothing paid or a part payment during the cover with the balance unpaid at expiry.
//
// The maker says how far the cover ran. As far as the payments took it (No Premium, No Cover): the whole unpaid
// balance is cancelled from the paid-to date. Or the insurer kept the cover on to a date: the premium earned for that
// time and not paid is a shortfall, borne by the insurer or paid by the broker as a bad debt. Premium already paid to
// the insurer beyond what it keeps is recovered or absorbed. A different supervisor approves.
export function WriteOffRequestModal({
  open, txId, initialRemarks, onClose, onDone,
}: {
  open: boolean;
  txId: number;
  initialRemarks: string;
  onClose: () => void;
  onDone: (result: EndorsementDetail) => void;
}) {
  const [timeOnRisk, setTimeOnRisk] = useState<TimeOnRisk>("PAID_TO");
  const [coverEnd, setCoverEnd] = useState("");
  const [earnedBasis, setEarnedBasis] = useState<"PRO_RATA" | "SHORT_RATE">("PRO_RATA");
  const [retainedPct, setRetainedPct] = useState("");
  const [shortfallRoute, setShortfallRoute] = useState<ShortfallRoute | null>(null);
  const [route, setRoute] = useState<WriteOffRoute | null>(null);
  const [remarks, setRemarks] = useState(initialRemarks);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices: WriteOffChoices = timeOnRisk === "ON_RISK"
    ? {
      time_on_risk: "ON_RISK", ...(coverEnd ? { cover_end_date: coverEnd } : {}), earned_basis: earnedBasis,
      ...(earnedBasis === "SHORT_RATE" && retainedPct !== "" ? { short_rate_retained_pct: retainedPct } : {}),
      ...(shortfallRoute ? { shortfall_route: shortfallRoute } : {}),
    }
    : { time_on_risk: "PAID_TO" };
  if (route && route !== "NONE") choices.route = route;

  // Re-worked on the server (the same code that posts) whenever a choice changes.
  const { data: preview, error: queryError, isFetching: loading } = useQuery({
    queryKey: ["engine", "write-off-preview", txId, choices],
    queryFn: () => engine.previewWriteOff(txId, choices),
    enabled: open, placeholderData: keepPreviousData, retry: false, gcTime: 0,
  });
  const loadError = queryError ? (queryError instanceof Error ? queryError.message : "Could not work out the write-off.") : null;

  const c = preview?.calc;
  const exposed = Boolean(c && c.insurerExposure > 0);
  const hasShortfall = Boolean(c && c.shortfall > 0);
  const blocked = Boolean(preview?.claims.blocked);
  // What the screen shows as decided: a choice the figures need stays undecided until the maker makes it.
  const shownRoute: WriteOffRoute | null = exposed ? route : "NONE";
  const shownShortfall: ShortfallRoute | null = hasShortfall ? shortfallRoute : null;
  const undecided = (exposed && !route) || (hasShortfall && !shortfallRoute);

  async function submit() {
    setError(null);
    if (hasShortfall && !shortfallRoute) return setError("Choose who bears the premium the insurer earned but the client never paid.");
    if (exposed && !route) return setError("Choose how the premium already paid to the insurer is settled.");
    if (remarks.trim().length < 10) return setError("Remarks must say what happened (at least 10 characters).");
    setBusy(true);
    try {
      onDone(await engine.requestWriteOff(txId, { ...choices, remarks: remarks.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request the write-off.");
    } finally {
      setBusy(false);
    }
  }

  const option = <T extends string>(name: string, value: T, current: T | null, set: (v: T) => void, title: string, hint: string) => (
    <label key={value} className={`ee-reason${current === value ? " is-selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => set(value)} />
      <span><strong>{title}</strong><small>{hint}</small></span>
    </label>
  );

  return (
    <Modal
      open={open}
      xwide
      title="Cancel / write off for non-payment"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={busy || loading || !preview || blocked || undecided}>Submit for supervisor approval</button>
        </>
      }
    >
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {loadError && <div className="ee-claims" role="alert">{loadError}</div>}
      {loading && !preview && <p className="muted" role="status">Working out the write-off…</p>}
      {preview && c && (
        <div className="ee-wizard">
          <div className="ee-form">
            <div className="ee-lock-note" role="note">
              <span>
                The cover ran {preview.policy.start_date} to {preview.policy.end_date} and has expired with {fmtKobo(c.outstanding)} unpaid
                {c.premiumPaid > 0 ? <> (the client paid {fmtKobo(c.premiumPaid)} of {fmtKobo(c.policyPremium)})</> : <> (nothing paid)</>}.
              </span>
            </div>

            <fieldset className="ee-reasons" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ marginBottom: "0.4rem" }}><strong>How far did the cover run?</strong></legend>
              {option("ee-wo-tor", "PAID_TO", timeOnRisk, setTimeOnRisk,
                c.premiumPaid > 0 ? "As far as the client's payments took it" : "It never attached: nothing was paid",
                c.premiumPaid > 0
                  ? `No Premium, No Cover: the payments bought cover to ${timeOnRisk === "PAID_TO" ? preview.coverEndDate : "the paid-to date"} (pro-rata). The whole unpaid balance is cancelled, not a bad debt.`
                  : "No Premium, No Cover: the whole premium is cancelled from inception, not a bad debt.")}
              {option("ee-wo-tor", "ON_RISK", timeOnRisk, setTimeOnRisk, "The insurer kept the cover on to a date",
                "The insurer held cover on credit (to expiry, or until it cancelled). Premium it earned for that time and the client didn't pay is a shortfall someone has to bear.")}
            </fieldset>

            {timeOnRisk === "ON_RISK" && (
              <>
                <div className="field">
                  <label htmlFor="ee-wo-end">Cover kept on to</label>
                  <input id="ee-wo-end" type="date" min={preview.policy.start_date} max={preview.policy.end_date}
                    value={coverEnd || preview.policy.end_date} onChange={(e) => setCoverEnd(e.target.value)} />
                  <small>Expiry if the insurer held cover to the end; otherwise the date it cancelled for non-payment.</small>
                </div>
                <div className="field">
                  <label htmlFor="ee-wo-basis">Premium earned for that time</label>
                  <select id="ee-wo-basis" value={earnedBasis} onChange={(e) => setEarnedBasis(e.target.value as "PRO_RATA" | "SHORT_RATE")}>
                    <option value="PRO_RATA">Pro-rata (premium × days on risk ÷ policy days)</option>
                    <option value="SHORT_RATE">Short-rate / short-period scale (insurer cancelled)</option>
                  </select>
                </div>
                {earnedBasis === "SHORT_RATE" && (
                  <div className="field">
                    <label htmlFor="ee-wo-sr">Retained by insurer (%)</label>
                    <input id="ee-wo-sr" type="number" min="0" max="100" step="0.01" value={retainedPct}
                      placeholder={c.retainedBps != null ? String(c.retainedBps / 100) : "from scale"} onChange={(e) => setRetainedPct(e.target.value)} />
                    <small>Blank uses the {preview.shortRate?.source === "insurer" ? "insurer's" : "default"} short-period scale{preview.shortRate ? ` (${preview.shortRate.months} month(s) on risk)` : ""}.</small>
                  </div>
                )}
              </>
            )}

            {hasShortfall && (
              <fieldset className="ee-reasons" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ marginBottom: "0.4rem" }}>
                  The insurer earned <strong>{fmtKobo(c.shortfall)}</strong> the client never paid. Who bears it?
                </legend>
                {option("ee-wo-sf", "INSURER_BEARS", shortfallRoute, setShortfallRoute, SHORTFALL_ROUTE_LABEL.INSURER_BEARS,
                  "The insurer agrees to cancel its earned premium too (it held cover on credit at its own risk). Nothing is lost by the broker.")}
                {option("ee-wo-sf", "BROKER_BEARS", shortfallRoute, setShortfallRoute, SHORTFALL_ROUTE_LABEL.BROKER_BEARS,
                  `The insurer insists on its premium. The broker pays it the net ${fmtKobo(c.shortfall - Math.round(c.shortfall * c.commissionRatio))} (forgoing its brokerage) from operating and writes it off as a bad debt.`)}
              </fieldset>
            )}

            {exposed && (
              <fieldset className="ee-reasons" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ marginBottom: "0.4rem" }}>
                  <strong>{fmtKobo(c.insurerExposure)}</strong> was already paid to {preview.policy.insurer_name} beyond what it keeps. Who bears it?
                </legend>
                {option("ee-wo-route", "RECOVER_FROM_INSURER", route, setRoute, WRITE_OFF_ROUTE_LABEL.RECOVER_FROM_INSURER,
                  "The insurer refunds it. The RP debit note waits on the \"Insurer RP refunds due\" list.")}
                {option("ee-wo-route", "BROKER_ABSORBS", route, setRoute, WRITE_OFF_ROUTE_LABEL.BROKER_ABSORBS,
                  "The insurer won't refund it. It is expensed as the broker's bad debt, and the trust account is topped up from operating.")}
              </fieldset>
            )}

            {blocked && (
              <div className="ee-claims" role="alert">
                <strong>Claim after the cover ended.</strong> {preview.claims.message} The insurer won't pay it: settle that claim's position with the insurer first.
              </div>
            )}
            {preview.claims.inCover.length > 0 && !blocked && (
              <div className="ee-route" role="note">
                <span className="ee-chip is-warn">Claims in cover</span>{" "}
                {preview.claims.inCover.map((cl) => `${cl.claim_no} (${cl.status}, loss ${cl.date_of_loss || "undated"})`).join(", ")}: the insurer is on risk for these
                and may deduct the unpaid premium from what it pays.
              </div>
            )}

            <div className="field">
              <label htmlFor="ee-wo-remarks">Remarks (audit trail)</label>
              <textarea id="ee-wo-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Paid 40% in March; reminders in Jul, Aug, Sep; insurer confirmed cover lapsed at the paid-to date." />
            </div>
            <p className="muted">Dual control: a supervisor other than you must approve. On approval the policy is closed and comes off the debtors list.</p>
          </div>

          <aside className={`ee-drawer${loading ? " is-busy" : ""}`} aria-live="polite" aria-busy={loading} aria-label="Write-off summary">
            <h3>What happens {loading && <span className="ee-chip is-info" role="status">Recalculating…</span>}</h3>
            <div className="ee-kv">
              <div><span>Premium due</span><strong>{fmtKobo(c.policyPremium)}</strong></div>
              <div><span>Paid by client (stays earned)</span><strong>{fmtKobo(c.premiumPaid)}</strong></div>
              <div><span>{c.timeOnRisk === "ON_RISK" ? "Insurer on risk to" : "Cover paid to"}</span><strong>{preview.coverEndDate}</strong></div>
              <div><span>Days on risk</span><strong>{c.daysOnRisk} / {c.policyDays}</strong></div>
              <div><span>Cancelled (never on risk)</span><strong>{fmtKobo(c.cancelled)}</strong></div>
              {hasShortfall && <div><span>Shortfall (earned, unpaid)</span><strong>{fmtKobo(c.shortfall)}</strong></div>}
              {c.recoverable > 0 && shownRoute && <div><span>To recover from insurer</span><strong>{fmtKobo(c.recoverable)}</strong></div>}
              <div><span>Bad debt (broker)</span><strong>{undecided ? "—" : fmtKobo(c.badDebt)}</strong></div>
            </div>
            <div className="ee-docs">
              <section className="ee-doc" aria-label={preview.documents.rpDebitNote.title}>
                <header><h4>{preview.documents.rpDebitNote.title}</h4><span className="ee-chip">{shownRoute === "RECOVER_FROM_INSURER" ? "Insurer refund due" : "Offset"}</span></header>
                <div className="muted">To {preview.documents.rpDebitNote.to} · amends {preview.documents.rpDebitNote.parent}</div>
                <dl>
                  <dt>Gross premium the insurer gives up</dt><dd>{fmtKobo(preview.documents.rpDebitNote.gross)}</dd>
                  <dt>Less brokerage (never earned)</dt><dd>({fmtKobo(preview.documents.rpDebitNote.commission)})</dd>
                  <dt className="ee-total">Net premium cancelled</dt><dd className="ee-total">{fmtKobo(preview.documents.rpDebitNote.net)}</dd>
                  {shownShortfall === "BROKER_BEARS" && <><dt>Insurer keeps the shortfall, paid by the broker</dt><dd>{fmtKobo(c.shortfallNet)}</dd></>}
                </dl>
              </section>
              <section className="ee-doc" aria-label={preview.documents.rpCreditNote.title}>
                <header><h4>{preview.documents.rpCreditNote.title}</h4><span className="ee-chip is-info">Client</span></header>
                <div className="muted">To {preview.documents.rpCreditNote.to} · amends {preview.documents.rpCreditNote.parent}</div>
                <dl>
                  <dt>Unpaid premium written off</dt><dd>{fmtKobo(preview.documents.rpCreditNote.gross)}</dd>
                  <dt className="ee-total">Offset against what they owe</dt><dd className="ee-total">{fmtKobo(preview.documents.rpCreditNote.offsetAgainstOutstanding)}</dd>
                  <dt>Cash refund</dt><dd>{fmtKobo(0)}</dd>
                </dl>
              </section>
            </div>
            <div className="ee-route">
              {undecided ? <>Make the choices on the left to see the ledger entry.</> : c.recoverable + c.badDebt === 0 ? (
                <>Ledger: nothing posts. The unpaid premium and its brokerage were never booked, because the ledger books them only when the client pays.</>
              ) : (
                <>
                  Ledger:
                  {c.recoverable > 0 && <> Dr return premium receivable from insurer {fmtKobo(c.recoverable)};</>}
                  {c.badDebt > 0 && <> Dr bad debts written off {fmtKobo(c.badDebt)};</>}
                  {" "}Cr premium payable {fmtKobo(c.recoverable + c.badDebt)}.
                  {c.badDebt > 0 && <> Dr client trust bank / Cr operating bank {fmtKobo(c.badDebt)} (the approver enters the transfer reference).</>}
                  {c.shortfallToRemit > 0 && shownShortfall === "BROKER_BEARS" && <> {fmtKobo(c.shortfallToRemit)} goes on the Insurer Remittances list to pay.</>}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

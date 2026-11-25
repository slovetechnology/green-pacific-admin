import { Fragment, useEffect, useMemo, useState } from "react";
import { Modal } from "@/shared/components/exec/Modal";
import { ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { engine, fmtKobo, humanize, type EndorsementDetail, type LockSummary, type Preview } from "../api";

// Endorsement / refund wizard for a mid-term cancellation (Scenario 1) or an item removal (Scenario 2). The live
// calculator drawer re-runs the server calculation (decimal-exact, the same code that posts) as the form changes:
// original vs earned vs returned figures, a side-by-side preview of the RP Debit Note (insurer) and the RP Credit
// Note (client), and how the money settles (net-off against an unremitted credit note, or an insurer refund).

interface RiskItemOption { id: number; label: string; value: number; removed?: boolean }

export function ReturnPremiumWizard({
  open, txId, type, lock, items, initialRemarks, onClose, onDone,
}: {
  open: boolean;
  txId: number;
  type: "MTC_CANCELLATION" | "ITEM_REMOVAL";
  lock: LockSummary;
  items: RiskItemOption[];
  initialRemarks: string;
  onClose: () => void;
  onDone: (result: EndorsementDetail) => void;
}) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    effective_date: today, calculation_basis: "PRO_RATA", short_rate_retained_pct: "", schedule_item_id: "", item_premium: "",
    admin_fee: "", reason_code: "", remarks: initialRemarks, claim_override_reason: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const reasonCodes = lock.reasonCodes[type] || [];
  const liveItems = items.filter((i) => !i.removed);

  const request = useMemo(() => ({
    endorsement_type: type, effective_date: form.effective_date, calculation_basis: form.calculation_basis,
    short_rate_retained_pct: form.short_rate_retained_pct, schedule_item_id: form.schedule_item_id || undefined,
    item_premium: form.item_premium, admin_fee: form.admin_fee,
  }), [type, form.effective_date, form.calculation_basis, form.short_rate_retained_pct, form.schedule_item_id, form.item_premium, form.admin_fee]);

  const needsItem = type === "ITEM_REMOVAL" && !request.schedule_item_id;
  // Live calculator: debounced server preview.
  useEffect(() => {
    if (!open || needsItem) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setCalculating(true);
      try {
        const p = await engine.preview(txId, request);
        if (!cancelled) { setPreview(p); setPreviewError(null); }
      } catch (err) {
        if (!cancelled) { setPreview(null); setPreviewError(err instanceof Error ? err.message : "Could not calculate."); }
      } finally {
        if (!cancelled) setCalculating(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, needsItem, txId, request]);

  async function submit() {
    setError(null);
    if (!form.reason_code) return setError("Choose a reason.");
    if (form.remarks.trim().length < 10) return setError("Remarks must say what happened (at least 10 characters).");
    if (preview?.claims.blocked && !form.claim_override_reason.trim()) return setError(preview.claims.message || "Claim history blocks this return premium.");
    setBusy(true);
    try {
      onDone(await engine.apply(txId, { ...request, reason_code: form.reason_code, remarks: form.remarks, claim_override_reason: form.claim_override_reason || undefined }));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not post the endorsement.");
    } finally {
      setBusy(false);
    }
  }

  const c = preview?.calc;
  const title = type === "MTC_CANCELLATION" ? "Mid-term cancellation — return premium" : "Item deletion endorsement — return premium";

  return (
    <Modal
      open={open}
      xwide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={busy || !preview || needsItem || calculating}>
            Post {type === "MTC_CANCELLATION" ? "cancellation" : "item removal"}
          </button>
        </>
      }
    >
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      <div className="ee-wizard">
        <div className="ee-form">
          {type === "ITEM_REMOVAL" && (
            <div className="field">
              <label htmlFor="ee-item">Item to remove</label>
              <select id="ee-item" value={form.schedule_item_id} onChange={(e) => set({ schedule_item_id: e.target.value, item_premium: "" })}>
                <option value="">Choose…</option>
                {liveItems.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
              <small>Removed items stay on the schedule, marked “deleted (endorsed)”.</small>
            </div>
          )}
          <div className="field">
            <label htmlFor="ee-eff">{type === "ITEM_REMOVAL" ? "Effective removal date" : "Cancellation effective date"}</label>
            <input id="ee-eff" type="date" value={form.effective_date} onChange={(e) => set({ effective_date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ee-basis">Calculation basis</label>
            <select id="ee-basis" value={form.calculation_basis} onChange={(e) => set({ calculation_basis: e.target.value })}>
              <option value="PRO_RATA">Pro-rata (premium × unexpired days ÷ policy days)</option>
              <option value="SHORT_RATE">Short-rate / short-period tariff (insurer penalty)</option>
            </select>
          </div>
          {form.calculation_basis === "SHORT_RATE" && (
            <div className="field">
              <label htmlFor="ee-sr">Retained by insurer (%)</label>
              <input id="ee-sr" type="number" min="0" max="100" step="0.01" value={form.short_rate_retained_pct}
                placeholder={preview?.calc.retainedBps != null ? String(preview.calc.retainedBps / 100) : "from scale"}
                onChange={(e) => set({ short_rate_retained_pct: e.target.value })} />
              <small>Blank uses the {preview?.shortRate?.source === "insurer" ? "insurer's" : "default"} short-period scale{preview?.shortRate ? ` (${preview.shortRate.months} month(s) in force)` : ""}.</small>
            </div>
          )}
          {type === "ITEM_REMOVAL" && form.schedule_item_id && (
            <div className="field">
              <label htmlFor="ee-ip">Item premium (annual)</label>
              <input id="ee-ip" type="number" min="0" step="0.01" value={form.item_premium}
                placeholder={preview?.item ? String(preview.item.item_premium_cents / 100) : ""} onChange={(e) => set({ item_premium: e.target.value })} />
              <small>{preview?.item ? `Using ${preview.item.premium_source}. Override if the insurer rated the item differently.` : ""}</small>
            </div>
          )}
          <div className="field">
            <label htmlFor="ee-fee">Broker admin fee (optional)</label>
            <input id="ee-fee" type="number" min="0" step="0.01" value={form.admin_fee} onChange={(e) => set({ admin_fee: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ee-reason">Reason</label>
            <select id="ee-reason" value={form.reason_code} onChange={(e) => set({ reason_code: e.target.value })}>
              <option value="">Choose…</option>
              {reasonCodes.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ee-remarks2">Remarks (audit trail)</label>
            <textarea id="ee-remarks2" rows={3} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
          </div>
          {preview?.claims.blocked && (
            <div className="ee-claims" role="alert">
              <strong>No Return Premium Due to Claim History.</strong>
              <div>{preview.claims.message}</div>
              {user?.isAdmin ? (
                <div className="field" style={{ marginTop: "0.5rem" }}>
                  <label htmlFor="ee-override">Compliance override reason</label>
                  <textarea id="ee-override" rows={2} value={form.claim_override_reason} onChange={(e) => set({ claim_override_reason: e.target.value })} />
                </div>
              ) : (
                <div>Only a compliance admin can override this.</div>
              )}
            </div>
          )}
        </div>

        <aside className={`ee-drawer${calculating ? " is-busy" : ""}`} aria-live="polite" aria-busy={calculating} aria-label="Live calculator">
          <h3>Live calculator {calculating && <span className="ee-chip is-info" role="status">Recalculating…</span>}</h3>
          {needsItem ? <p className="muted">Choose the item to remove.</p> : previewError && !preview && <p className="muted">{previewError}</p>}
          {!needsItem && preview && c && (
            <>
              <div className="ee-kv">
                <div><span>Policy days</span><strong>{c.policyDays}</strong></div>
                <div><span>Unexpired days</span><strong>{c.unexpiredDays}</strong></div>
                <div><span>Commission rate</span><strong>{(c.commissionRatio * 100).toFixed(2)}%</strong></div>
                <div><span>{c.basis === "SHORT_RATE" ? "Retained (short-rate)" : "Return ratio"}</span>
                  <strong>{c.basis === "SHORT_RATE" ? `${((c.retainedBps || 0) / 100).toFixed(2)}%` : `${((c.unexpiredDays / c.policyDays) * 100).toFixed(2)}%`}</strong></div>
              </div>
              <table className="ee-compare">
                <thead><tr><th /><th>Original annual</th><th>Earned</th><th>Unearned / return</th></tr></thead>
                <tbody>
                  <tr><td>Gross premium</td><td>{fmtKobo(preview.comparison.original.gross)}</td><td>{fmtKobo(preview.comparison.earned.gross)}</td><td className="is-return">{fmtKobo(preview.comparison.returned.gross)}</td></tr>
                  <tr><td>Commission</td><td>{fmtKobo(preview.comparison.original.commission)}</td><td>{fmtKobo(preview.comparison.earned.commission)}</td><td className="is-return">{fmtKobo(preview.comparison.returned.commission)}</td></tr>
                  <tr><td>Net premium</td><td>{fmtKobo(preview.comparison.original.net)}</td><td>{fmtKobo(preview.comparison.earned.net)}</td><td className="is-return">{fmtKobo(preview.comparison.returned.net)}</td></tr>
                </tbody>
              </table>

              <div className="ee-docs">
                <section className="ee-doc" aria-label={preview.documents.rpDebitNote.title}>
                  <header>
                    <h4>{preview.documents.rpDebitNote.title}</h4>
                    <span className={`ee-chip ${preview.remittanceStatus === "REMITTED" ? "is-warn" : "is-ok"}`}>{preview.documents.rpDebitNote.badge}</span>
                  </header>
                  <div className="muted">To {preview.documents.rpDebitNote.to} · amends {preview.documents.rpDebitNote.parent}</div>
                  <dl>
                    <dt>Gross return premium</dt><dd>{fmtKobo(preview.documents.rpDebitNote.gross)}</dd>
                    <dt>Less commission clawback</dt><dd>({fmtKobo(preview.documents.rpDebitNote.commission)})</dd>
                    <dt className="ee-total">Net RP due from insurer</dt><dd className="ee-total">{fmtKobo(preview.documents.rpDebitNote.amountDue)}</dd>
                  </dl>
                </section>
                <section className="ee-doc" aria-label={preview.documents.rpCreditNote.title}>
                  <header>
                    <h4>{preview.documents.rpCreditNote.title}</h4>
                    <span className="ee-chip is-info">Client</span>
                  </header>
                  <div className="muted">To {preview.documents.rpCreditNote.to} · amends {preview.documents.rpCreditNote.parent}</div>
                  <dl>
                    <dt>Gross return premium</dt><dd>{fmtKobo(preview.documents.rpCreditNote.gross)}</dd>
                    {preview.documents.rpCreditNote.adminFee > 0 && <><dt>Less admin fee</dt><dd>({fmtKobo(preview.documents.rpCreditNote.adminFee)})</dd></>}
                    {c.taxes.map((t) => (
                      <Fragment key={t.code}>
                        <dt>{t.name}{t.refundable ? " reversed" : " (not refundable)"}</dt>
                        <dd>{t.refundable ? fmtKobo(t.refunded_cents) : "—"}</dd>
                      </Fragment>
                    ))}
                    <dt className="ee-total">Credit to client</dt><dd className="ee-total">{fmtKobo(preview.documents.rpCreditNote.amountDue)}</dd>
                    <dt>· cash refund due</dt><dd>{fmtKobo(preview.documents.rpCreditNote.cashRefund)}</dd>
                    <dt>· offset against outstanding</dt><dd>{fmtKobo(preview.documents.rpCreditNote.offsetAgainstOutstanding)}</dd>
                  </dl>
                </section>
              </div>

              <div className="ee-route">
                {preview.settlementRoute === "NET_OFF" && <>
                  <span className="ee-chip is-ok">UNREMITTED (Can Offset)</span>{" "}
                  The net RP {fmtKobo(c.cash.netCash)} is netted off the pending remittance on {preview.policy.credit_note_no}; the client's
                  {" "}{fmtKobo(c.cash.walletCredit)} is available to refund at once.
                </>}
                {preview.settlementRoute === "PENDING_INSURER_REFUND" && <>
                  <span className="ee-chip is-warn">REMITTED (Requires Insurer Refund)</span>{" "}
                  The insurer already holds the premium. The client's {fmtKobo(c.cash.walletCredit)} waits in
                  {" "}<strong>PENDING_INSURER_REFUND</strong> until the insurer pays {fmtKobo(c.cash.netCash)}, unless a supervisor pre-funds it.
                </>}
                {preview.settlementRoute === "NONE" && <>
                  <span className="ee-chip">No cash</span>{" "}
                  The client hasn't paid for the returned cover, so the credit note only reduces what they owe. Nothing is refunded.
                </>}
              </div>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

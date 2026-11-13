import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { Modal } from "@/shared/components/exec/Modal";
import { fmtMoney } from "@/shared/lib/format";
import { GateNotice } from "./GateNotice";
import { complianceOf, describeError, missingOf, toFraction, toPercent, type DealDetail, type GateItem } from "../lib/types";

interface WinResult {
  deal: { id: number };
  transaction: { id: number; policy_no: string | null; debit_note_no: string | null; premium_due: number; total_brokerage: number } | null;
  createdPolicy: boolean;
  subBroker: { attached?: boolean; alreadyAttached?: boolean; percent?: number; reference?: string } | null;
  warnings: string[];
}

// Winning a deal: create the policy from it (the usual way) or link one that was
// entered by hand. Everything except the policy number is already known.
export function WinDialog({ dealId, open, onClose, onDone }: { dealId: number | null; open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open && dealId !== null} title="Mark as won" onClose={onClose} wide>
      {dealId !== null && <WinBody dealId={dealId} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function WinBody({ dealId, onClose, onDone }: { dealId: number; onClose: () => void; onDone: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["deals", String(dealId)], queryFn: () => api.get<DealDetail>(`/api/deals/${dealId}`) });
  if (isLoading || !data) return <p>Loading…</p>;
  return <WinForm detail={data} onClose={onClose} onDone={onDone} />;
}

function WinForm({ detail, onClose, onDone }: { detail: DealDetail; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { deal } = detail;
  const [mode, setMode] = useState<"create" | "link">("create");
  const [policyNo, setPolicyNo] = useState("");
  const [start, setStart] = useState(deal.period_start ?? "");
  const [end, setEnd] = useState(deal.period_end ?? "");
  const [premium, setPremium] = useState(String(deal.estimated_premium || ""));
  const [ratePct, setRatePct] = useState(String(toPercent(deal.estimated_commission_rate)));
  const [tppd, setTppd] = useState("");
  const [debitNote, setDebitNote] = useState("");
  const [channel, setChannel] = useState("Received");
  const [linkTx, setLinkTx] = useState(deal.bound_transaction_id ? String(deal.bound_transaction_id) : "");
  const [kycReason, setKycReason] = useState("");
  const [complianceReason, setComplianceReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing: GateItem[]; compliance: { message: string }[]; canOverride: boolean } | null>(null);
  const [result, setResult] = useState<WinResult | null>(null);

  const isMotor = /motor|vehicle|motorcycle/i.test(deal.class_of_business ?? "");
  const needsKycOverride = Boolean(error?.missing.some((m) => m.code === "kyc_verified"));
  const needsComplianceOverride = Boolean(error?.compliance.length);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (mode === "create") {
      const policy: Record<string, unknown> = {
        policy_no: policyNo, start_date: start, end_date: end, premium_due: premium, commission_rate: toFraction(ratePct),
      };
      if (tppd) policy.tppd_limit = tppd;
      if (debitNote) policy.debit_note_no = debitNote;
      body.create_policy = policy;
    } else {
      body.transaction_id = linkTx;
    }
    if (deal.sub_broker_id) body.sub_broker_channel = channel;
    if (kycReason.trim()) body.kyc_override_reason = kycReason.trim();
    if (complianceReason.trim()) body.compliance_override_reason = complianceReason.trim();
    try {
      setResult(await api.post<WinResult>(`/api/deals/${deal.id}/win`, body));
    } catch (err) {
      setError({
        message: describeError(err), missing: missingOf(err), compliance: complianceOf(err),
        canOverride: err instanceof ApiError && err.data?.canOverride === true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="pl-form">
        <div className="pl-notice is-good" role="status">
          <h3>{deal.deal_name} is won</h3>
          {result.transaction ? (
            <p style={{ margin: 0 }}>
              Policy {result.transaction.policy_no || "(number to follow)"} created, debit note {result.transaction.debit_note_no || "—"}, premium{" "}
              {fmtMoney(result.transaction.premium_due)}, brokerage {fmtMoney(result.transaction.total_brokerage)}.
            </p>
          ) : (
            <p style={{ margin: 0 }}>The existing policy is now linked to this deal.</p>
          )}
          {result.subBroker?.attached && <p style={{ margin: "0.3rem 0 0" }}>Sub-broker {result.subBroker.reference} attached at {result.subBroker.percent}%.</p>}
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="pl-modal-foot">
          {result.transaction && <Link className="btn btn-outline btn-sm" to={`/transactions/${result.transaction.id}`}>Open policy</Link>}
          <button type="button" className="btn btn-sm" onClick={() => { onDone(); onClose(); }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="pl-form">
      <div className="pl-toggle" role="group" aria-label="How to record the policy" style={{ alignSelf: "flex-start" }}>
        <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>Create the policy</button>
        <button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")}>Link an existing policy</button>
      </div>

      {mode === "create" ? (
        <>
          <p className="pl-hint">Insurer, class, subject, sum insured, producer and slip come from the deal and the selected quote. The debit note number is assigned for you.</p>
          <div className="pl-grid-2">
            <div className="field">
              <label htmlFor="win-policy">Policy number</label>
              <input id="win-policy" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} placeholder="From the insurer; can be added later" />
            </div>
            <div className="field">
              <label htmlFor="win-debit">Debit note number (optional)</label>
              <input id="win-debit" value={debitNote} onChange={(e) => setDebitNote(e.target.value)} placeholder="Assigned automatically" />
            </div>
            <div className="field">
              <label htmlFor="win-start">Start date</label>
              <input id="win-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="win-end">End date</label>
              <input id="win-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="win-premium">Premium (₦)</label>
              <input id="win-premium" type="number" min="0" step="0.01" value={premium} onChange={(e) => setPremium(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="win-rate">Commission rate (%)</label>
              <input id="win-rate" type="number" min="0" max="100" step="0.01" value={ratePct} onChange={(e) => setRatePct(e.target.value)} required />
            </div>
            {isMotor && (
              <div className="field">
                <label htmlFor="win-tppd">Third-party property damage limit (₦)</label>
                <input id="win-tppd" type="number" min="0" value={tppd} onChange={(e) => setTppd(e.target.value)} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="win-link">Policy already on the system</label>
          <select id="win-link" value={linkTx} onChange={(e) => setLinkTx(e.target.value)} required>
            <option value="">Choose a policy…</option>
            {detail.clientTransactions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.policy_no || "(no policy no.)"} · {t.class_of_business} · {t.trans_date}
              </option>
            ))}
          </select>
        </div>
      )}

      {deal.sub_broker_id && (
        <div className="field">
          <label htmlFor="win-channel">Business from {detail.subBroker?.name ?? "the sub-broker"} was</label>
          <select id="win-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="Received">Received through them</option>
            <option value="Placed">Placed through them</option>
          </select>
          <p className="pl-hint">Their share comes from their rate card when the policy is created.</p>
        </div>
      )}

      {error && (
        <>
          <GateNotice message={error.message} items={error.missing} dealId={deal.id} tone="crit" />
          {error.compliance.length > 0 && (
            <ul className="pl-notice is-crit" style={{ margin: 0 }}>
              {error.compliance.map((c) => (
                <li key={c.message}>{c.message}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {needsKycOverride && user?.isAdmin && (
        <div className="field">
          <label htmlFor="win-kyc">Admin override: bind without verified KYC</label>
          <textarea id="win-kyc" rows={2} value={kycReason} onChange={(e) => setKycReason(e.target.value)} placeholder="Why is this acceptable? Recorded in the audit trail." />
        </div>
      )}
      {needsComplianceOverride && error?.canOverride && (
        <div className="field">
          <label htmlFor="win-compliance">Admin override: save despite the compliance block</label>
          <textarea id="win-compliance" rows={2} value={complianceReason} onChange={(e) => setComplianceReason(e.target.value)} placeholder="Why is this acceptable? Recorded in the audit trail." />
        </div>
      )}

      <div className="pl-modal-foot">
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-sm" disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create policy and win" : "Link policy and win"}
        </button>
      </div>
    </form>
  );
}

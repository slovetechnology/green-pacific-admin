import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface FormOptions {
  clients: { id: number; name: string }[];
  transactions: { id: number; policy_no: string | null; class_of_business: string | null; trans_date: string | null; client_id: number; client_name: string }[];
  handlers: { id: number; username: string }[];
  statuses: string[];
  lossTypes: string[];
  relationshipTypes: string[];
}

// Common root causes, offered as suggestions; any text is accepted. Used in the client risk report.
const CLAIM_CAUSE_SUGGESTIONS = [
  "Electrical fault", "Driver error", "Third-party negligence", "Mechanical failure", "Poor housekeeping",
  "Security lapse", "Employee dishonesty", "Natural causes", "Flooding / blocked drainage", "Packing / handling damage",
];

interface Claim {
  id: number;
  claim_no: string;
  client_id: number;
  client_name: string;
  transaction_id: number | null;
  date_of_loss: string | null;
  date_reported: string | null;
  reported_by_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  relationship_to_insured: string | null;
  loss_type: string | null;
  claim_cause: string | null;
  location_of_loss: string | null;
  description: string | null;
  police_report_no: string | null;
  police_station: string | null;
  third_party_involved: number;
  third_party_details: string | null;
  status: string;
  claimed_amount: number;
  excess_amount: number;
  approved_amount: number;
  paid_amount: number;
  salvage_recovery_amount: number;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
  adjuster_id: number | null;
  handler_user_id: number | null;
}

interface AdjusterOption {
  id: number;
  adjuster_ref: string | null;
  name: string;
  contact_person: string | null;
  office_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
}

export function ClaimFormPage() {
  const { claimId } = useParams();
  const isEdit = Boolean(claimId);
  const [searchParams] = useSearchParams();
  const preselectClientId = searchParams.get("client_id") || "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState(preselectClientId);
  const [transactionId, setTransactionId] = useState("");
  const [dateOfLoss, setDateOfLoss] = useState("");
  const [dateReported, setDateReported] = useState(new Date().toISOString().slice(0, 10));
  const [reportedByName, setReportedByName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [lossType, setLossType] = useState("");
  const [claimCause, setClaimCause] = useState("");
  const [locationOfLoss, setLocationOfLoss] = useState("");
  const [description, setDescription] = useState("");
  const [policeReportNo, setPoliceReportNo] = useState("");
  const [policeStation, setPoliceStation] = useState("");
  const [thirdPartyInvolved, setThirdPartyInvolved] = useState(false);
  const [thirdPartyDetails, setThirdPartyDetails] = useState("");
  const [status, setStatus] = useState("Filed");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [excessAmount, setExcessAmount] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [recoveryAmount, setRecoveryAmount] = useState("");
  const [adjusterName, setAdjusterName] = useState("");
  const [adjusterPhone, setAdjusterPhone] = useState("");
  const [adjusterEmail, setAdjusterEmail] = useState("");
  // The loss adjusters directory entry the claim is linked to (claims.adjuster_id); blank means typed by hand.
  const [adjusterId, setAdjusterId] = useState("");
  // Blank on a new claim means "me" (the backend defaults to the creator).
  const [handlerUserId, setHandlerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["claims", "meta"],
    queryFn: () => api.get<FormOptions>("/api/claims/meta/form-options"),
  });

  // Loss adjusting firms on file (Business Partners > Loss Adjusters); picking one fills the adjuster fields.
  const adjustersQuery = useQuery({
    queryKey: ["loss-adjusters", "options"],
    queryFn: () =>
      api.get<{ lossAdjusters: AdjusterOption[] }>("/api/loss-adjusters/options"),
  });
  const adjusters = adjustersQuery.data?.lossAdjusters ?? [];
  function pickAdjuster(id: string) {
    const firm = adjusters.find((a) => String(a.id) === id);
    setAdjusterId(firm ? String(firm.id) : "");
    if (!firm) return;
    setAdjusterName(firm.name);
    setAdjusterPhone([firm.office_phone, firm.mobile_phone].filter(Boolean).join(", "));
    setAdjusterEmail((firm.email || "").split(",")[0].trim());
  }

  const editQuery = useQuery({
    queryKey: ["claims", claimId],
    queryFn: () => api.get<{ claim: Claim }>(`/api/claims/${claimId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (isEdit && editQuery.data) {
      const c = editQuery.data.claim;
      setClientId(String(c.client_id));
      setTransactionId(c.transaction_id ? String(c.transaction_id) : "");
      setDateOfLoss(c.date_of_loss || "");
      setDateReported(c.date_reported || "");
      setReportedByName(c.reported_by_name || "");
      setReporterPhone(c.reporter_phone || "");
      setReporterEmail(c.reporter_email || "");
      setRelationship(c.relationship_to_insured || "");
      setLossType(c.loss_type || "");
      setClaimCause(c.claim_cause || "");
      setLocationOfLoss(c.location_of_loss || "");
      setDescription(c.description || "");
      setPoliceReportNo(c.police_report_no || "");
      setPoliceStation(c.police_station || "");
      setThirdPartyInvolved(Boolean(c.third_party_involved));
      setThirdPartyDetails(c.third_party_details || "");
      setStatus(c.status);
      setClaimedAmount(String(c.claimed_amount ?? ""));
      setExcessAmount(String(c.excess_amount ?? ""));
      setApprovedAmount(String(c.approved_amount ?? ""));
      setPaidAmount(String(c.paid_amount ?? ""));
      setRecoveryAmount(String(c.salvage_recovery_amount ?? ""));
      setAdjusterName(c.adjuster_name || "");
      setAdjusterPhone(c.adjuster_phone || "");
      setAdjusterEmail(c.adjuster_email || "");
      setAdjusterId(c.adjuster_id ? String(c.adjuster_id) : "");
      setHandlerUserId(c.handler_user_id ? String(c.handler_user_id) : "");
    }
  }, [isEdit, editQuery.data]);

  const opts = optionsQuery.data;
  const clientTransactions = useMemo(
    () => (opts?.transactions || []).filter((t) => String(t.client_id) === clientId),
    [opts, clientId]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload = {
      client_id: clientId,
      transaction_id: transactionId || null,
      date_of_loss: dateOfLoss,
      date_reported: dateReported,
      reported_by_name: reportedByName,
      reporter_phone: reporterPhone,
      reporter_email: reporterEmail,
      relationship_to_insured: relationship,
      loss_type: lossType,
      claim_cause: claimCause,
      location_of_loss: locationOfLoss,
      description,
      police_report_no: policeReportNo,
      police_station: policeStation,
      third_party_involved: thirdPartyInvolved,
      third_party_details: thirdPartyDetails,
      status,
      claimed_amount: claimedAmount,
      excess_amount: excessAmount,
      approved_amount: approvedAmount,
      ...(isEdit ? { paid_amount: paidAmount, salvage_recovery_amount: recoveryAmount } : {}),
      adjuster_name: adjusterName,
      adjuster_phone: adjusterPhone,
      adjuster_email: adjusterEmail,
      adjuster_id: adjusterId ? Number(adjusterId) : null,
      handler_user_id: handlerUserId || null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/claims/${claimId}`, payload);
        await queryClient.invalidateQueries({ queryKey: ["claims"] });
        navigate(`/claims/${claimId}`);
      } else {
        const result = await api.post<{ claimId: number }>("/api/claims", payload);
        await queryClient.invalidateQueries({ queryKey: ["claims"] });
        navigate(`/claims/${result.claimId}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? "Edit Claim" : "New Claim"}</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="section-title">Policy &amp; client</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="client_id">Client</label>
              {isEdit ? (
                <input value={editQuery.data?.claim.client_name || ""} disabled />
              ) : (
                <select id="client_id" required value={clientId} onChange={(e) => { setClientId(e.target.value); setTransactionId(""); }}>
                  <option value="">— Select client —</option>
                  {opts?.clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="field">
              <label htmlFor="transaction_id">Related Policy (optional)</label>
              <select id="transaction_id" value={transactionId} onChange={(e) => setTransactionId(e.target.value)}>
                <option value="">— None —</option>
                {(isEdit ? opts?.transactions.filter((t) => String(t.client_id) === clientId) : clientTransactions)?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.policy_no || `#${t.id}`} — {t.class_of_business} ({t.trans_date})
                  </option>
                ))}
              </select>
            </div>
            {!isEdit && (
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {(opts?.statuses || ["Filed"]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="section-title">Reported by</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="reported_by_name">Name</label>
              <input id="reported_by_name" value={reportedByName} onChange={(e) => setReportedByName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="relationship">Relationship to Insured</label>
              <select id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="">— Select —</option>
                {opts?.relationshipTypes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="reporter_phone">Phone</label>
              <input id="reporter_phone" value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="reporter_email">Email</label>
              <input id="reporter_email" type="email" value={reporterEmail} onChange={(e) => setReporterEmail(e.target.value)} />
            </div>
          </div>

          <div className="section-title">Loss details</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="date_of_loss">Date of Loss</label>
              <input id="date_of_loss" type="date" value={dateOfLoss} onChange={(e) => setDateOfLoss(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="date_reported">Date Reported</label>
              <input id="date_reported" type="date" value={dateReported} onChange={(e) => setDateReported(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="loss_type">Type of Loss</label>
              <select id="loss_type" value={lossType} onChange={(e) => setLossType(e.target.value)}>
                <option value="">— Select —</option>
                {opts?.lossTypes.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="claim_cause">Root Cause</label>
              <input
                id="claim_cause"
                list="claim_cause_options"
                placeholder="e.g. Electrical fault, driver error"
                value={claimCause}
                onChange={(e) => setClaimCause(e.target.value)}
              />
              <datalist id="claim_cause_options">
                {CLAIM_CAUSE_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="location_of_loss">Location of Loss</label>
              <input id="location_of_loss" value={locationOfLoss} onChange={(e) => setLocationOfLoss(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="police_report_no">Police Report No</label>
              <input id="police_report_no" value={policeReportNo} onChange={(e) => setPoliceReportNo(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="police_station">Police Station</label>
              <input id="police_station" value={policeStation} onChange={(e) => setPoliceStation(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="third_party_involved">Third Party Involved?</label>
              <select
                id="third_party_involved"
                value={thirdPartyInvolved ? "yes" : "no"}
                onChange={(e) => setThirdPartyInvolved(e.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {thirdPartyInvolved && (
              <div className="field span-2">
                <label htmlFor="third_party_details">Third Party / Witness Details</label>
                <input
                  id="third_party_details"
                  placeholder="Name, phone, vehicle reg, insurer, witnesses…"
                  value={thirdPartyDetails}
                  onChange={(e) => setThirdPartyDetails(e.target.value)}
                />
              </div>
            )}
            <div className="field span-3">
              <label htmlFor="description">Description / Circumstances</label>
              <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="section-title">Financials</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="claimed_amount">Claimed Amount</label>
              <input id="claimed_amount" type="number" step="0.01" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="excess_amount">Policy Excess/Deductible</label>
              <input id="excess_amount" type="number" step="0.01" value={excessAmount} onChange={(e) => setExcessAmount(e.target.value)} />
            </div>
            {isEdit && (
              <div className="field">
                <label htmlFor="approved_amount">Approved Amount</label>
                <input id="approved_amount" type="number" step="0.01" value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
              </div>
            )}
            {isEdit && (
              <div className="field">
                <label htmlFor="paid_amount">Paid Amount</label>
                <input id="paid_amount" type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
              </div>
            )}
            {isEdit && (
              <div className="field">
                <label htmlFor="salvage_recovery_amount">Salvage / Subrogation Recovered</label>
                <input
                  id="salvage_recovery_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={recoveryAmount}
                  onChange={(e) => setRecoveryAmount(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="section-title">Claim handler</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="handler_user_id">Handled by</label>
              <select id="handler_user_id" value={handlerUserId} onChange={(e) => setHandlerUserId(e.target.value)}>
                {/* An assigned handler can be changed but not removed. */}
                {(!isEdit || !editQuery.data?.claim.handler_user_id) && (
                  <option value="">{isEdit ? "Not assigned" : "Me"}</option>
                )}
                {(opts?.handlers || []).map((h) => (
                  <option key={h.id} value={h.id}>{h.username}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-title">Adjuster</div>
          <div className="form-grid">
            {adjusters.length > 0 && (
              <div className="field span-3">
                <label htmlFor="adjuster_pick">Pick a loss adjuster</label>
                <select
                  id="adjuster_pick"
                  value={adjusterId || String(adjusters.find((a) => a.name === adjusterName)?.id ?? "")}
                  onChange={(e) => pickAdjuster(e.target.value)}
                >
                  <option value="">Choose from the loss adjusters directory…</option>
                  {adjusters.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.adjuster_ref ? `${a.adjuster_ref} · ${a.name}` : a.name}
                    </option>
                  ))}
                </select>
                <p className="field-hint">Fills the name, phone and email below; you can still edit them.</p>
              </div>
            )}
            <div className="field">
              <label htmlFor="adjuster_name">Adjuster Name</label>
              <input id="adjuster_name" value={adjusterName} onChange={(e) => { setAdjusterName(e.target.value); setAdjusterId(""); }} />
            </div>
            <div className="field">
              <label htmlFor="adjuster_phone">Adjuster Phone</label>
              <input id="adjuster_phone" value={adjusterPhone} onChange={(e) => setAdjusterPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="adjuster_email">Adjuster Email</label>
              <input id="adjuster_email" type="email" value={adjusterEmail} onChange={(e) => setAdjusterEmail(e.target.value)} />
            </div>
          </div>

          {isEdit && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Insurer claim reference and loss-registration date are set from the claim's detail page via
              "Register Loss with Insurer", not here.
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Log claim"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

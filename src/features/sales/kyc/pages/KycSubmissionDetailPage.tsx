import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";

interface Kyc {
  id: number;
  reference_no: string;
  created_at: string;
  title: string | null;
  surname: string;
  first_name: string;
  other_names: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  nationality: string | null;
  state_of_origin: string | null;
  occupation: string | null;
  employer_name: string | null;
  employer_address: string | null;
  bvn: string | null;
  nin: string | null;
  tin: string | null;
  id_type: string | null;
  id_number: string | null;
  id_issue_date: string | null;
  id_expiry_date: string | null;
  phone: string | null;
  phone_alt: string | null;
  email: string | null;
  residential_address: string | null;
  residential_city: string | null;
  residential_state: string | null;
  residential_country: string | null;
  proof_of_address_type: string | null;
  business_address: string | null;
  nok_name: string | null;
  nok_relationship: string | null;
  nok_phone: string | null;
  nok_address: string | null;
  source_of_income: string | null;
  annual_income_band: string | null;
  is_pep: string | null;
  pep_details: string | null;
  class_of_business: string | null;
  sum_proposed: number;
  id_document_path: string | null;
  passport_photo_path: string | null;
  proof_of_address_path: string | null;
  signature_path: string | null;
  client_id: number | null;
  customer_user_id: number | null;
  source: string | null;
  submission_count: number | null;
  submitted_at: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  risk_score: number | null;
  risk_level: string | null;
  risk_factors: { code: string; weight: number; description: string }[] | null;
  tier: number | null;
}

interface Client {
  id: number;
  name: string;
}

interface KycEvent {
  id: number;
  action: string;
  status: string | null;
  reason: string | null;
  actor: string | null;
  created_at: string;
}

interface Response {
  kyc: Kyc;
  linkedClient: { id: number; name: string } | null;
  clients: Client[];
  statuses: string[];
  events: KycEvent[];
  customer: { id: number; name: string; email: string; phone: string | null; client_id: number | null } | null;
}

const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  resubmitted: "Resubmitted after a rejection",
  verified: "Verified",
  rejected: "Rejected",
  reopened: "Set back to pending",
  note: "Note",
};

const TIER_LABELS: Record<number, string> = { 1: "Tier 1 — Simplified (SDD)", 2: "Tier 2 — Standard (CDD)", 3: "Tier 3 — Enhanced (EDD)" };

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function KycSubmissionDetailPage() {
  const { kycId } = useParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [linkClientName, setLinkClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["kyc", kycId],
    queryFn: () => api.get<Response>(`/api/kyc/${kycId}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>KYC submission not found.</p>;
  const { kyc, linkedClient, clients, events = [], customer } = data;
  const reviewStatus = status || kyc.status;
  const name = [kyc.title, kyc.first_name, kyc.other_names, kyc.surname].filter(Boolean).join(" ");

  async function handleReview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/api/kyc/${kycId}/review`, {
        status: status || kyc.status,
        review_notes: notes,
        link_client_name: linkClientName,
      });
      await queryClient.invalidateQueries({ queryKey: ["kyc"] });
      setNotes("");
      setLinkClientName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{kyc.reference_no}</p>
          <h1>{name}</h1>
        </div>
        <div className="page-header-actions">
          {kyc.source === "portal" && <span className="badge">Customer portal</span>}
          <StatusBadge status={kyc.status} />
          <a className="btn-secondary btn" href={apiUrl(`/api/kyc/${kycId}/pdf`)}>Download PDF</a>
        </div>
      </div>

      <div className="card">
        <div className="detail-grid">
          <Field label="Submitted" value={(kyc.submitted_at || kyc.created_at || "").replace("T", " ").slice(0, 16)} />
          {(kyc.submission_count ?? 1) > 1 && <Field label="Submissions" value={`${kyc.submission_count} (resubmitted after rejection)`} />}
          {customer && <Field label="Portal account" value={`${customer.name} · ${customer.email}${customer.phone ? ` · ${customer.phone}` : ""}`} />}
          <Field
            label="Linked Client"
            value={linkedClient ? <Link to={`/clients/${linkedClient.id}`}>{linkedClient.name} →</Link> : null}
          />
        </div>
      </div>

      <div className="card">
        <h2>A. Personal Details</h2>
        <div className="detail-grid">
          <Field label="Date of Birth" value={kyc.date_of_birth} />
          <Field label="Gender" value={kyc.gender} />
          <Field label="Marital Status" value={kyc.marital_status} />
          <Field label="Nationality" value={kyc.nationality} />
          <Field label="State of Origin" value={kyc.state_of_origin} />
          <Field label="Occupation" value={kyc.occupation} />
          <Field label="Employer / Business Name" value={kyc.employer_name} />
          <Field label="Employer Address" value={kyc.employer_address} />
          <Field label="BVN" value={kyc.bvn} />
          <Field label="NIN" value={kyc.nin} />
          <Field label="TIN" value={kyc.tin} />
        </div>
      </div>

      <div className="card">
        <h2>B. Identification</h2>
        <div className="detail-grid">
          <Field label="Means of ID" value={kyc.id_type} />
          <Field label="ID Number" value={kyc.id_number} />
          <Field label="ID Issue Date" value={kyc.id_issue_date} />
          <Field label="ID Expiry Date" value={kyc.id_expiry_date} />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          {kyc.id_document_path && <a className="btn-secondary btn-sm" href={apiUrl(`/api/kyc/${kycId}/file/id_document`)}>ID Document</a>}
          {kyc.passport_photo_path && <a className="btn-secondary btn-sm" href={apiUrl(`/api/kyc/${kycId}/file/passport_photo`)}>Passport Photo</a>}
          {kyc.proof_of_address_path && <a className="btn-secondary btn-sm" href={apiUrl(`/api/kyc/${kycId}/file/proof_of_address_doc`)}>Proof of Address</a>}
          {kyc.signature_path && <a className="btn-secondary btn-sm" href={apiUrl(`/api/kyc/${kycId}/file/signature`)}>Signature</a>}
        </div>
      </div>

      <div className="card">
        <h2>C. Contact &amp; Address</h2>
        <div className="detail-grid">
          <Field label="Phone" value={kyc.phone} />
          <Field label="Alternate Phone" value={kyc.phone_alt} />
          <Field label="Email" value={kyc.email} />
          <Field label="Residential Address" value={kyc.residential_address} />
          <Field label="City" value={kyc.residential_city} />
          <Field label="State" value={kyc.residential_state} />
          <Field label="Country" value={kyc.residential_country} />
          <Field label="Proof of Address" value={kyc.proof_of_address_type} />
          <Field label="Business Address" value={kyc.business_address} />
        </div>
      </div>

      <div className="card">
        <h2>D. Next of Kin</h2>
        <div className="detail-grid">
          <Field label="Name" value={kyc.nok_name} />
          <Field label="Relationship" value={kyc.nok_relationship} />
          <Field label="Phone" value={kyc.nok_phone} />
          <Field label="Address" value={kyc.nok_address} />
        </div>
      </div>

      <div className="card">
        <h2>E. Financial Profile</h2>
        <div className="detail-grid">
          <Field label="Source of Income" value={kyc.source_of_income} />
          <Field label="Estimated Annual Income" value={kyc.annual_income_band} />
          <Field label="PEP" value={kyc.is_pep} />
          <Field label="PEP Details" value={kyc.pep_details} />
        </div>
      </div>

      {/* The KYC form no longer asks for the cover wanted (the quote request does); older submissions and
          spreadsheet imports may still carry it. */}
      {(kyc.class_of_business || kyc.sum_proposed) ? (
        <div className="card">
          <h2>Insurance Cover (recorded on this KYC)</h2>
          <div className="detail-grid">
            <Field label="Class / Purpose of Cover" value={kyc.class_of_business} />
            <Field label="Estimated Sum Insured" value={kyc.sum_proposed ? fmtMoney(kyc.sum_proposed) : "—"} />
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>Risk Assessment</h2>
        <div className="detail-grid">
          <Field
            label="Risk Level"
            value={kyc.risk_level ? <StatusBadge status={kyc.risk_level} /> : "—"}
          />
          <Field label="Risk Score" value={kyc.risk_score !== null && kyc.risk_score !== undefined ? `${kyc.risk_score} / 100` : "—"} />
          <Field label="Due Diligence Tier" value={kyc.tier ? TIER_LABELS[kyc.tier] || `Tier ${kyc.tier}` : "—"} />
        </div>
        {kyc.risk_factors && kyc.risk_factors.length > 0 ? (
          <table style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr><th>Factor</th><th className="num">Weight</th></tr>
            </thead>
            <tbody>
              {kyc.risk_factors.map((f) => (
                <tr key={f.code}>
                  <td>{f.description}</td>
                  <td className="num">{f.weight > 0 ? `+${f.weight}` : f.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="page-lede">No risk factors were found.</p>
        )}
      </div>

      {events.length > 0 && (
        <div className="card">
          <h2>History</h2>
          <table>
            <thead>
              <tr><th>When</th><th>What</th><th>By</th><th>Reason / note</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{(e.created_at || "").replace("T", " ").slice(0, 16)}</td>
                  <td>{EVENT_LABELS[e.action] ?? e.action}</td>
                  <td>{e.actor?.startsWith("portal:") ? "Customer" : e.actor ?? "—"}</td>
                  <td>{e.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoleGate need="write">
        <div className="card">
          <h2>Review</h2>
          {error && <div className="flash flash-error">{error}</div>}
          {kyc.risk_level === "high" && (
            <div className="flash flash-warning">
              This applicant is high-risk. Only an admin can approve them.
            </div>
          )}
          {kyc.reviewed_by && (
            <p className="page-lede">
              Last reviewed by {kyc.reviewed_by} on {(kyc.reviewed_at || "").slice(0, 16)}
              {kyc.review_notes ? ` — "${kyc.review_notes}"` : ""}
            </p>
          )}
          <form onSubmit={handleReview}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="review_status">Status</label>
                <select id="review_status" value={status || kyc.status} onChange={(e) => setStatus(e.target.value)}>
                  {data.statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {/* Ask for a client only when none is known: a linked KYC, or a portal customer (matched or created
                  by the applicant's name when verified), already has one. */}
              {linkedClient ? (
                <div className="field">
                  <span className="k">Client</span>
                  <div className="v"><Link to={`/clients/${linkedClient.id}`}>{linkedClient.name}</Link></div>
                </div>
              ) : kyc.customer_user_id ? (
                <div className="field">
                  <span className="k">Client</span>
                  <div className="v text-muted">Matched or created from the applicant's name when verified</div>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="link_client_name">Link to client</label>
                  <input
                    id="link_client_name"
                    list="client-options"
                    placeholder="Existing or new client name"
                    value={linkClientName}
                    onChange={(e) => setLinkClientName(e.target.value)}
                  />
                  <datalist id="client-options">
                    {clients.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              )}
              <div className="field span-2">
                <label htmlFor="review_notes">{reviewStatus === "Rejected" ? "Reason for rejecting (the customer sees it)" : "Notes"}</label>
                <textarea id="review_notes" rows={2} required={reviewStatus === "Rejected" && reviewStatus !== kyc.status} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Saving…" : "Save review"}
              </button>
            </div>
          </form>
        </div>
      </RoleGate>
    </div>
  );
}

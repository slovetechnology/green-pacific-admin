import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError, apiUrl, documentTooLarge } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import { ClaimTracker } from "../components/ClaimTracker";

interface Claim {
  id: number;
  claim_no: string;
  date_of_loss: string | null;
  date_reported: string | null;
  loss_type: string | null;
  location_of_loss: string | null;
  description: string | null;
  police_report_no: string | null;
  police_station: string | null;
  third_party_involved: number;
  third_party_details: string | null;
  status: string;
  claimed_amount: number;
  approved_amount: number;
  insurer_claim_no: string | null;
  date_notified_to_insurer: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
}

interface Transaction {
  id: number;
  policy_no: string | null;
}

interface ClaimEvent {
  id: number;
  event_date: string | null;
  status: string | null;
  note: string | null;
}

interface DocumentRow {
  id: number;
  doc_type: string;
  title: string | null;
  uploaded_at: string;
}

interface Response {
  claim: Claim;
  transaction: Transaction | null;
  events: ClaimEvent[];
  documents: DocumentRow[];
  docTypes: string[];
}

export function PortalClaimDetailPage() {
  const { claimId } = useParams();
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "claims", claimId],
    queryFn: () => api.get<Response>(`/api/portal/claims/${claimId}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Claim not found.</p>;
  const { claim, transaction, events, documents } = data;

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!docFile) {
      setError("Choose a file to upload.");
      return;
    }
    if (!docType) {
      setError("Choose a document type.");
      return;
    }
    const tooLarge = documentTooLarge(docFile);
    if (tooLarge) {
      setError(tooLarge);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("doc_type", docType);
      fd.append("file", docFile);
      await apiUpload(`/api/portal/claims/${claimId}/documents`, fd);
      await queryClient.invalidateQueries({ queryKey: ["portal", "claims", claimId] });
      setDocType("");
      setDocFile(null);
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
          <p className="eyebrow">
            <Link to="/portal/claims">Claims</Link>
          </p>
          <h1>{claim.claim_no}</h1>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={claim.status} />
          <a className="btn-secondary btn" href={apiUrl(`/api/portal/claims/${claimId}/pdf`)} target="_blank" rel="noreferrer">
            Download Claim Form (PDF)
          </a>
        </div>
      </div>

      {error && <div className="flash flash-error">{error}</div>}

      <div className="cp-panel" style={{ padding: "18px 20px", marginBottom: "1.1rem" }}>
        <ClaimTracker status={claim.status} />
      </div>

      <div className="card">
        <div className="detail-grid">
          <div>
            <div className="k">Date of Loss</div>
            <div className="v">{claim.date_of_loss || "—"}</div>
          </div>
          <div>
            <div className="k">Date Reported</div>
            <div className="v">{claim.date_reported || "—"}</div>
          </div>
          <div>
            <div className="k">Type of Loss</div>
            <div className="v">{claim.loss_type || "—"}</div>
          </div>
          <div>
            <div className="k">Location of Loss</div>
            <div className="v">{claim.location_of_loss || "—"}</div>
          </div>
          <div>
            <div className="k">Claimed Amount</div>
            <div className="v">{fmtMoney(claim.claimed_amount)}</div>
          </div>
          <div>
            <div className="k">Approved Amount</div>
            <div className="v">{fmtMoney(claim.approved_amount)}</div>
          </div>
          <div>
            <div className="k">Related Policy</div>
            <div className="v">{transaction ? transaction.policy_no || `#${transaction.id}` : "—"}</div>
          </div>
          <div>
            <div className="k">Insurer Claim Reference</div>
            <div className="v">{claim.insurer_claim_no || "Not yet registered with insurer"}</div>
          </div>
          <div>
            <div className="k">Adjuster</div>
            <div className="v">
              {claim.adjuster_name || "—"}
              {claim.adjuster_phone ? ` · ${claim.adjuster_phone}` : ""}
              {claim.adjuster_email ? ` · ${claim.adjuster_email}` : ""}
            </div>
          </div>
          {Boolean(claim.third_party_involved) && (
            <div className="span-2">
              <div className="k">Third Party / Witness Details</div>
              <div className="v">{claim.third_party_details || "—"}</div>
            </div>
          )}
          <div className="span-2">
            <div className="k">Description</div>
            <div className="v">{claim.description || "—"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Supporting Documents</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No documents uploaded yet.</td>
                </tr>
              )}
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.doc_type}</td>
                  <td>{d.title || "—"}</td>
                  <td>{(d.uploaded_at || "").slice(0, 10)}</td>
                  <td>
                    <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/portal/documents/${d.id}/file`)} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleUpload} style={{ marginTop: "1rem" }}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="doc_type">Document Type</label>
              <select id="doc_type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="">— Select —</option>
                {data.docTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="doc_file">File (PDF, PNG, JPG) — photos, police report, repair estimate…</label>
              <input
                id="doc_file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Claim History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-state">No updates yet.</td>
                </tr>
              )}
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.event_date || "—"}</td>
                  <td>
                    <StatusBadge status={ev.status} />
                  </td>
                  <td>{ev.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

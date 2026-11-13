import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBrokingSlip,
  approveBrokingSlip,
  recordMarketSubmission,
  getBrokingSlipPdfUrl,
  type PolicyDocumentResult
} from "../api/brokingSlips";
import { PolicyDocumentPanel } from "../components/PolicyDocumentPanel";
import { fmtMoney } from "@/shared/lib/format";

export function BrokingSlipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const slipId = Number(id);
  const queryClient = useQueryClient();

  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [responseStatus, setResponseStatus] = useState("Pending");
  const [responseNotes, setResponseNotes] = useState("");

  const { data: slip, isLoading, isError } = useQuery({
    queryKey: ["brokingSlip", slipId],
    queryFn: () => fetchBrokingSlip(slipId),
    enabled: !isNaN(slipId)
  });

  const [policyResult, setPolicyResult] = useState<PolicyDocumentResult | null>(null);

  const approveMutation = useMutation({
    mutationFn: () => approveBrokingSlip(slipId),
    onSuccess: (approved) => {
      setPolicyResult(approved.policyResult ?? null);
      queryClient.invalidateQueries({ queryKey: ["brokingSlip", slipId] });
      queryClient.invalidateQueries({ queryKey: ["policyDocument", slipId] });
    }
  });

  const submissionMutation = useMutation({
    mutationFn: () => recordMarketSubmission(slipId, {
      recipientName,
      recipientEmail,
      responseStatus,
      responseNotes
    }),
    onSuccess: () => {
      setShowSubmissionModal(false);
      setRecipientName("");
      setRecipientEmail("");
      setResponseNotes("");
      queryClient.invalidateQueries({ queryKey: ["brokingSlip", slipId] });
    }
  });

  if (isLoading) return <div className="loading-container">Loading broking slip...</div>;
  if (isError || !slip) return <div className="alert alert-danger">Broking slip not found.</div>;

  const marketShares = slip.marketShares || [];
  const submissions = slip.submissions || [];
  const versions = slip.versions || [];
  const data = slip.data || {};

  return (
    <div className="page-container">
      {/* Header Banner */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <h1 className="page-title" style={{ margin: 0 }}>{slip.slip_number}</h1>
            <span className="badge badge-secondary">v{slip.version}</span>
            <span className={`status-badge status-${(slip.status || "draft").toLowerCase().replace(/\s+/g, "-")}`}>
              {slip.status}
            </span>
          </div>
          <p className="page-subtitle">{slip.title}</p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a
            href={getBrokingSlipPdfUrl(slip.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            📄 Download / Print PDF
          </a>

          <Link to={`/broking-slips/${slip.id}/placement`} className="btn btn-outline">
            Placement View
          </Link>

          <Link to={`/broking-slips/${slip.id}/edit`} className="btn btn-outline">
            Edit Slip
          </Link>

          {slip.status !== "Approved" && slip.status !== "Placed" && (
            <button
              type="button"
              className="btn btn-success"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              Approve Slip
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowSubmissionModal(true)}
          >
            + Log Market Submission
          </button>
        </div>
      </div>

      {approveMutation.isError && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>{(approveMutation.error as Error).message}</div>
      )}

      <PolicyDocumentPanel slip={slip} justApproved={policyResult} />

      {/* Key Summary Cards */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="card-title" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
          Key Broking Summary
        </h3>
        <div className="form-grid">
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>CLIENT / INSURED</span>
            <strong>{slip.client_name || "—"}</strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>CLASS OF BUSINESS</span>
            <strong>{slip.class_of_business || "—"}</strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>SUM INSURED (100%)</span>
            <strong className="font-mono" style={{ color: "var(--primary-color)" }}>
              {slip.sum_insured > 0 ? fmtMoney(slip.sum_insured) : "—"}
            </strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>PERIOD OF INSURANCE</span>
            <strong>{slip.effective_date || "TBA"} to {slip.expiry_date || "TBA"}</strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>LEAD UNDERWRITER</span>
            <strong>{slip.lead_insurer_name || "Market Subscription"}</strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>PREMIUM DUE</span>
            <strong className="font-mono">
              {slip.premium > 0 ? fmtMoney(slip.premium) : "—"}
            </strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>COMMISSION RATE</span>
            <strong>{slip.commission_rate ? `${slip.commission_rate}%` : "Standard"}</strong>
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>PREPARED / APPROVED BY</span>
            <span>{slip.prepared_by || "—"} / {slip.approved_by || "Pending"}</span>
          </div>
        </div>
      </div>

      {/* Market Reform Contract Co-Insurance Table */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="card-title">Market Reform Contract — Underwriters Subscription</h3>
        {marketShares.length === 0 ? (
          <p className="text-muted">100% Single Underwriter Direct Placement.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Underwriter / Insurer</th>
                  <th>Role</th>
                  <th className="num">Written Line</th>
                  <th className="num">Signed Line</th>
                  <th className="num">Premium Share</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {marketShares.map(ms => (
                  <tr key={ms.id}>
                    <td><strong>{ms.insurer_name}</strong></td>
                    <td><span className={`badge ${ms.role === "Leader" ? "badge-primary" : "badge-secondary"}`}>{ms.role}</span></td>
                    <td className="num">{ms.written_line}%</td>
                    <td className="num">{ms.signed_line}%</td>
                    <td className="num">{ms.premium_share > 0 ? fmtMoney(ms.premium_share) : "—"}</td>
                    <td>
                      <span className={`badge ${ms.status === "Signed" ? "badge-success" : ms.status === "Declined" ? "badge-danger" : "badge-warning"}`}>
                        {ms.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Structured Template Data */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 className="card-title">Slip Details & Coverage Specifications</h3>
        {Object.keys(data).length === 0 ? (
          <p className="text-muted">No additional parameters recorded.</p>
        ) : (
          <div className="form-grid">
            {Object.entries(data).map(([key, value]) => {
              if (value === "" || value === null || value === undefined) return null;
              return (
                <div key={key} style={{ marginBottom: "0.75rem" }}>
                  <span className="text-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                    {key.replace(/([A-Z])/g, " $1").toUpperCase()}
                  </span>
                  <div>{String(value)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Market Submissions Log */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 className="card-title" style={{ margin: 0 }}>Market Submissions & Underwriter Log</h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowSubmissionModal(true)}>
            + Add Submission
          </button>
        </div>

        {submissions.length === 0 ? (
          <p className="text-muted">No market submissions logged yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient / Underwriter</th>
                  <th>Submitted At</th>
                  <th>Submitted By</th>
                  <th>Response Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => (
                  <tr key={sub.id}>
                    <td>{sub.recipient_name || sub.recipient_email || "Underwriter"}</td>
                    <td>{new Date(sub.submitted_at).toLocaleDateString("en-GB")}</td>
                    <td>{sub.submitted_by || "—"}</td>
                    <td>
                      <span className={`badge ${sub.response_status === "Quoted" || sub.response_status === "Accepted" ? "badge-success" : "badge-secondary"}`}>
                        {sub.response_status}
                      </span>
                    </td>
                    <td>{sub.response_notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Version History Log */}
      <div className="card">
        <h3 className="card-title">Version Audit History</h3>
        {versions.length === 0 ? (
          <p className="text-muted">No previous versions recorded.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Changed By</th>
                  <th>Change Reason</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.id}>
                    <td><span className="badge badge-secondary">v{v.version}</span></td>
                    <td>{v.changed_by || "system"}</td>
                    <td>{v.change_reason || "Update"}</td>
                    <td>{new Date(v.created_at).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submission Modal */}
      {showSubmissionModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "500px" }}>
            <h3>Log Market Submission</h3>
            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Underwriter / Recipient Name</label>
              <input
                type="text"
                className="form-control"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="e.g. Leadway Assurance Underwriting Desk"
              />
            </div>

            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Recipient Email</label>
              <input
                type="email"
                className="form-control"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="e.g. quotes@insurer.com"
              />
            </div>

            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Response Status</label>
              <select
                className="form-control"
                value={responseStatus}
                onChange={e => setResponseStatus(e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="Quoted">Quoted</option>
                <option value="Accepted">Accepted</option>
                <option value="Declined">Declined</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: "1.5rem" }}>
              <label className="form-label">Notes / Quoted Terms</label>
              <textarea
                className="form-control"
                rows={3}
                value={responseNotes}
                onChange={e => setResponseNotes(e.target.value)}
                placeholder="Enter quotation notes, rate, or underwriter feedback..."
              />
            </div>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowSubmissionModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => submissionMutation.mutate()}
                disabled={submissionMutation.isPending}
              >
                {submissionMutation.isPending ? "Saving..." : "Record Submission"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

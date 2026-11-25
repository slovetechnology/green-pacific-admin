import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl, documentTooLarge } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { alertDialog, promptDialog } from "@/shared/components/Dialogs";
import { useAuth } from "@/features/platform/auth/AuthContext";

// The document checklist of a KYC submission (backend sales/kyc/kycDocuments.js). Every required document must be
// verified and in date before the KYC can be set to Verified, and whoever uploaded a document can't verify it.

export interface KycDocument {
  id: number;
  doc_type: string;
  party_name: string | null;
  file_path: string | null;
  original_name: string | null;
  status: "Pending" | "Verified" | "Rejected" | "Expired" | "Superseded";
  expires_on: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface KycChecklistItem {
  type: string;
  label: string;
  required: boolean;
  perParty: boolean;
  state: "Missing" | "Pending" | "Verified" | "Rejected" | "Expired";
  documents: KycDocument[];
}

export interface KycDocumentsView {
  customerType: "individual" | "corporate";
  items: KycChecklistItem[];
  outstanding: { type: string; label: string; state: string }[];
  history: KycDocument[];
  labels: Record<string, string>;
}

const when = (v: string | null) => (v || "").replace("T", " ").slice(0, 16);
const byWhom = (v: string | null) => (v?.startsWith("portal:") ? "the customer" : v?.startsWith("system:") ? "carried over" : v || "—");
const STATE_TONE: Record<string, string> = { Missing: "not-started", Pending: "pending", Verified: "verified", Rejected: "rejected", Expired: "expired" };

export function KycDocumentsCard({ kycId, kycStatus, view }: { kycId: number; kycStatus: string; view: KycDocumentsView }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [docType, setDocType] = useState("");
  const [partyName, setPartyName] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Bumped after an upload so the file input starts empty again.
  const [fileKey, setFileKey] = useState(0);
  const rejected = kycStatus === "Rejected";
  const perParty = view.items.find((i) => i.type === docType)?.perParty ?? false;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["kyc"] });

  async function upload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!docType) return setError("Choose which document this is.");
    if (!file) return setError("Attach the document file.");
    const tooLarge = documentTooLarge(file);
    if (tooLarge) return setError(tooLarge);
    const fd = new FormData();
    fd.append("doc_type", docType);
    if (partyName.trim()) fd.append("party_name", partyName.trim());
    if (expiresOn) fd.append("expires_on", expiresOn);
    fd.append("file", file);
    setBusy(true);
    try {
      await api.upload(`/api/kyc/${kycId}/documents`, fd);
      setDocType("");
      setPartyName("");
      setExpiresOn("");
      setFile(null);
      setFileKey((k) => k + 1);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The document could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function review(doc: KycDocument, decision: "Verified" | "Rejected") {
    let notes = "";
    let expires = doc.expires_on || "";
    if (decision === "Rejected") {
      const reason = await promptDialog({ title: "Reject document", message: `Why is the ${view.labels[doc.doc_type] || doc.doc_type} rejected? The reason is kept on the KYC.`, required: true, multiline: true, confirmLabel: "Reject" });
      if (!reason) return;
      notes = reason;
    } else {
      const answer = await promptDialog({
        title: "Verify document",
        message: `Check the ${view.labels[doc.doc_type] || doc.doc_type} against the original. If it has an expiry date (an ID card, a passport), enter it so the KYC expires with it. Leave it blank if it doesn't expire.`,
        label: "Expiry date (YYYY-MM-DD)",
        defaultValue: expires,
        placeholder: "e.g. 2029-06-30",
        confirmLabel: "Verify",
      });
      if (answer === null) return;
      expires = answer.trim();
    }
    try {
      await api.post(`/api/kyc/${kycId}/documents/${doc.id}/review`, { decision, notes, expires_on: decision === "Verified" ? expires : undefined });
      await refresh();
    } catch (err) {
      void alertDialog(err instanceof ApiError ? err.message : "The review could not be saved.");
    }
  }

  return (
    <div className="card">
      <h2>Documents</h2>
      <p className="page-lede">
        {view.customerType === "corporate" ? "Company" : "Individual"} checklist. Every required document must be verified, and still in date, before
        this KYC can be set to Verified. Whoever uploaded a document can't verify it.
      </p>
      {view.outstanding.length > 0 && kycStatus !== "Rejected" && (
        <div className={`flash ${kycStatus === "Verified" ? "flash-warning" : "flash-info"}`} role="status">
          {kycStatus === "Verified" ? "Verified before documents were checked one by one; still to verify: " : "Still to verify: "}
          {view.outstanding.map((o) => o.label).join("; ")}.
        </div>
      )}
      <table>
        <thead>
          <tr><th>Document</th><th>State</th><th>File</th><th>Expires</th><th>Uploaded</th><th>Review</th></tr>
        </thead>
        <tbody>
          {view.items.flatMap((item) => {
            const head = (
              <td rowSpan={Math.max(1, item.documents.length)}>
                <strong>{item.label}</strong>
                <div className="text-muted">{item.required ? "Required" : "Optional"}{item.perParty ? " · one per director" : ""}</div>
              </td>
            );
            const chip = <span className={`badge badge-${STATE_TONE[item.state]}`}>{item.state}</span>;
            if (!item.documents.length) {
              return [
                <tr key={item.type}>
                  {head}
                  <td>{chip}</td>
                  <td colSpan={4} className="text-muted">Not uploaded</td>
                </tr>,
              ];
            }
            return item.documents.map((d, i) => (
              <tr key={d.id}>
                {i === 0 && head}
                <td>
                  <span className={`badge badge-${STATE_TONE[d.status] || "pending"}`}>{d.status}</span>
                  {d.review_notes && d.status === "Rejected" && <div className="text-muted">{d.review_notes}</div>}
                </td>
                <td>
                  {d.file_path ? <a href={apiUrl(`/api/kyc/${kycId}/documents/${d.id}/file`)} target="_blank" rel="noreferrer">{d.party_name || d.original_name || "Open"}</a> : "—"}
                </td>
                <td className="nowrap">{d.expires_on || "—"}</td>
                <td>{when(d.uploaded_at)}<div className="text-muted">{byWhom(d.uploaded_by)}</div></td>
                <td>
                  {d.status === "Pending" && !rejected ? (
                    <RoleGate need="write">
                      {d.uploaded_by === user?.username ? (
                        <span className="text-muted">A colleague must verify your upload</span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: "0.4rem" }}>
                          <button type="button" className="btn btn-sm" onClick={() => review(d, "Verified")}>Verify</button>
                          <button type="button" className="btn-danger btn btn-sm" onClick={() => review(d, "Rejected")}>Reject</button>
                        </span>
                      )}
                    </RoleGate>
                  ) : d.reviewed_by ? (
                    <span className="text-muted">{byWhom(d.reviewed_by)}{d.reviewed_at ? `, ${when(d.reviewed_at)}` : ""}</span>
                  ) : "—"}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>

      {view.history.length > 0 && (
        <p style={{ marginTop: "0.5rem" }}>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            {showHistory ? "Hide" : "Show"} replaced documents ({view.history.length})
          </button>
        </p>
      )}
      {showHistory && (
        <table>
          <thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Was</th></tr></thead>
          <tbody>
            {view.history.map((d) => (
              <tr key={d.id}>
                <td>{view.labels[d.doc_type] || d.doc_type}{d.party_name ? ` (${d.party_name})` : ""}</td>
                <td>{d.file_path ? <a href={apiUrl(`/api/kyc/${kycId}/documents/${d.id}/file`)} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                <td>{when(d.uploaded_at)} · {byWhom(d.uploaded_by)}</td>
                <td>{d.reviewed_by ? `Reviewed by ${byWhom(d.reviewed_by)}` : "Not reviewed"}{d.review_notes ? `: ${d.review_notes}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!rejected && (
        <RoleGate need="write">
          <form onSubmit={upload} style={{ marginTop: "1rem" }}>
            <h3>Add a document</h3>
            {error && <div className="flash flash-error" role="alert">{error}</div>}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="kyc-doc-type">Document</label>
                <select id="kyc-doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="">Choose…</option>
                  {view.items.map((i) => <option key={i.type} value={i.type}>{i.label}{i.required ? "" : " (optional)"}</option>)}
                  {!view.items.some((i) => i.type === "OTHER") && <option value="OTHER">{view.labels.OTHER}</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kyc-doc-party">{perParty ? "Director's name (required)" : "Person or company (optional)"}</label>
                <input id="kyc-doc-party" value={partyName} onChange={(e) => setPartyName(e.target.value)} required={perParty} />
              </div>
              <div className="field">
                <label htmlFor="kyc-doc-expiry">Expires on (if it does)</label>
                <input id="kyc-doc-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="kyc-doc-file">File (PDF, PNG or JPEG, up to 10 MB)</label>
                <input key={fileKey} id="kyc-doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>{busy ? "Uploading…" : "Upload for verification"}</button>
            </div>
          </form>
        </RoleGate>
      )}
    </div>
  );
}

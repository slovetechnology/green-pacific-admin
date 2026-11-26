import { ClaimServicePanel, type ReserveMovement, type ServiceStage } from "../components/ClaimServicePanel";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError, apiUrl, documentTooLarge } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { alertDialog, confirmDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/executive.css";
import { ClaimMoneyPanel, type ClaimMoney } from "../components/ClaimMoneyPanel";

interface Claim {
  id: number;
  claim_no: string;
  client_id: number;
  client_name: string;
  transaction_id: number | null;
  source: string;
  date_of_loss: string | null;
  date_reported: string | null;
  reported_by_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  relationship_to_insured: string | null;
  loss_type: string | null;
  location_of_loss: string | null;
  description: string | null;
  police_report_no: string | null;
  police_station: string | null;
  third_party_involved: number;
  third_party_details: string | null;
  status: string;
  claimed_amount: number;
  excess_amount: number;
  reserve_amount: number;
  approved_amount: number;
  insurer_claim_no: string | null;
  date_notified_to_insurer: string | null;
  discharge_voucher_no: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  adjuster_email: string | null;
}

interface Transaction {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  insurer_id: number;
  insurer_name?: string | null;
  // Set when the policy is co-insured: every insurer of the placement and its share of the risk.
  coinsurance?: { id: number; insurer: string; credit_note_no: string | null; proportion: number }[] | null;
}

const pct = (p: number) => `${Number((p * 100).toFixed(4))}%`;

// Each insurer's part of an amount, to the kobo, the rounding residue on the largest share (as claimPolicy.js does).
function sharesOf(amount: number, members: { proportion: number }[]) {
  const total = Math.round((amount || 0) * 100);
  const parts = members.map((m) => Math.round(total * m.proportion));
  const largest = members.reduce((best, m, i) => (m.proportion > members[best].proportion ? i : best), 0);
  parts[largest] += total - parts.reduce((s, p) => s + p, 0);
  return parts.map((p) => p / 100);
}

interface ClaimEvent {
  id: number;
  event_date: string | null;
  status: string | null;
  note: string | null;
  created_by: string | null;
}

interface DocumentRow {
  id: number;
  doc_type: string;
  title: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

// The loss adjusters directory entry whose name matches the claim's adjuster, if any.
interface LossAdjuster {
  id: number;
  adjuster_ref: string | null;
  name: string;
  contact_person: string | null;
  address: string | null;
  office_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  website: string | null;
  licence_no: string | null;
  licence_status: string;
  is_active: number;
}

interface Response {
  claim: Claim;
  lossAdjuster: LossAdjuster | null;
  transaction: Transaction | null;
  events: ClaimEvent[];
  documents: DocumentRow[];
  statuses: string[];
  docTypes: string[];
  claimMoney?: ClaimMoney;
  service?: { stages: ServiceStage[]; overdue: number };
  reserveMovements?: ReserveMovement[];
}

export function ClaimDetailPage() {
  const { claimId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventStatus, setEventStatus] = useState("");
  const [note, setNote] = useState("");
  const [insurerClaimNo, setInsurerClaimNo] = useState("");
  const [dateNotified, setDateNotified] = useState(new Date().toISOString().slice(0, 10));
  const [docType, setDocType] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["claims", claimId],
    queryFn: () => api.get<Response>(`/api/claims/${claimId}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Claim not found.</p>;
  const { claim, transaction, events, documents, lossAdjuster } = data;
  // The claim's own adjuster phone/email win; otherwise the matching directory firm's.
  const adjusterPhone =
    claim.adjuster_phone || [lossAdjuster?.office_phone, lossAdjuster?.mobile_phone].filter(Boolean).join(", ");
  const adjusterEmails = (claim.adjuster_email || lossAdjuster?.email || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  async function handleAddEvent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/api/claims/${claimId}/events`, { status: eventStatus || claim.status, note });
      await queryClient.invalidateQueries({ queryKey: ["claims", claimId] });
      setNote("");
      setEventStatus("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterLoss(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!insurerClaimNo.trim()) {
      setError("Enter the insurer's claim reference.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/claims/${claimId}/register-loss`, {
        insurer_claim_no: insurerClaimNo,
        date_notified_to_insurer: dateNotified,
      });
      await queryClient.invalidateQueries({ queryKey: ["claims", claimId] });
      setInsurerClaimNo("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadDocument(e: FormEvent) {
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
      fd.append("title", docTitle);
      fd.append("file", docFile);
      await apiUpload(`/api/claims/${claimId}/documents`, fd);
      await queryClient.invalidateQueries({ queryKey: ["claims", claimId] });
      setDocType("");
      setDocTitle("");
      setDocFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog("Delete this claim? This cannot be undone."))) return;
    try {
      await api.delete(`/api/claims/${claimId}`);
      await queryClient.invalidateQueries({ queryKey: ["claims"] });
      navigate("/claims");
    } catch (err) {
      void alertDialog(err instanceof Error ? err.message : "Could not delete claim.");
    }
  }

  const tabs: TabDef[] = [
    { id: "details", label: "Claim details" },
    { id: "insurer", label: "Insurer & adjuster" },
    { id: "service", label: "Service & reserve", count: data.service?.overdue || 0 },
    { id: "money", label: "Claim money", count: data.claimMoney?.payments.filter((p) => !p.voided_at).length || 0 },
    { id: "documents", label: "Documents", count: documents.length },
    { id: "history", label: "History", count: events.length },
  ];
  const tab = tabs.some((x) => x.id === searchParams.get("tab")) ? (searchParams.get("tab") as string) : "details";
  function setTab(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id === "details") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  }

  const metrics: Metric[] = [
    { key: "claimed", label: "Claimed", value: fmtMoneyShort(claim.claimed_amount), title: fmtMoney(claim.claimed_amount) },
    { key: "excess", label: "Excess", value: fmtMoneyShort(claim.excess_amount), title: fmtMoney(claim.excess_amount) },
    { key: "reserve", label: "Reserve", value: fmtMoneyShort(claim.reserve_amount), title: fmtMoney(claim.reserve_amount), tone: claim.reserve_amount > 0 ? "warn" : "neutral" },
    { key: "approved", label: "Approved", value: fmtMoneyShort(claim.approved_amount), title: fmtMoney(claim.approved_amount), tone: claim.approved_amount > 0 ? "good" : "neutral" },
    { key: "docs", label: "Documents", value: documents.length },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">
            <Link to={`/clients/${claim.client_id}`}>{claim.client_name}</Link>
            {claim.source === "Portal" && <span className="badge badge-market-submission" style={{ marginLeft: "0.5rem" }}>Self-reported</span>}
          </span>
          <h1>{claim.claim_no}</h1>
        </div>
        <div className="exec-meta">
          <StatusBadge status={claim.status} />
          <span>Loss: {claim.date_of_loss || "—"}</span>
          <span>Reported: {claim.date_reported || "—"}</span>
        </div>
        <div className="exec-header-actions">
          <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/claims/${claimId}/pdf`)} target="_blank" rel="noreferrer">
            Claim form (PDF)
          </a>
          <RoleGate need="write">
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/claims/${claimId}/edit`)}>
              Edit
            </button>
            <button type="button" className="btn-danger btn btn-sm" onClick={handleDelete}>
              Delete
            </button>
          </RoleGate>
        </div>
      </header>

      {error && <div className="flash flash-error">{error}</div>}

      <MetricStrip metrics={metrics} label="Claim financial summary" />

      <section className="exec-workspace" aria-label="Claim workspace">
        <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="claim" label="Claim views" />

      {tab === "details" && (
      <div role="tabpanel" id="claim-panel-details" aria-labelledby="claim-tab-details" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Policy &amp; Reporter</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Related Policy</div>
            <div className="v">
              {transaction ? (
                <>
                  <Link to={`/transactions/${transaction.id}`}>{transaction.policy_no || `#${transaction.id}`}</Link>
                  {transaction.coinsurance ? (
                    <small> · co-insured: {transaction.coinsurance.map((m) => `${m.insurer} (${pct(m.proportion)})`).join(", ")}</small>
                  ) : (
                    transaction.insurer_name && <small> · {transaction.insurer_name}</small>
                  )}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="k">Reported By</div>
            <div className="v">
              {claim.reported_by_name || "—"}
              {claim.relationship_to_insured ? ` (${claim.relationship_to_insured})` : ""}
            </div>
          </div>
          <div>
            <div className="k">Reporter Contact</div>
            <div className="v">
              {claim.reporter_phone || "—"}
              {claim.reporter_email ? ` · ${claim.reporter_email}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Loss Details</h2>
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
            <div className="k">Police Report</div>
            <div className="v">
              {claim.police_report_no || "—"}
              {claim.police_station ? ` · ${claim.police_station}` : ""}
            </div>
          </div>
          <div>
            <div className="k">Third Party Involved</div>
            <div className="v">{claim.third_party_involved ? "Yes" : "No"}</div>
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
        <h2>Financials</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Claimed Amount</div>
            <div className="v">{fmtMoney(claim.claimed_amount)}</div>
          </div>
          <div>
            <div className="k">Policy Excess/Deductible</div>
            <div className="v">{fmtMoney(claim.excess_amount)}</div>
          </div>
          <div>
            <div className="k">Case Reserve</div>
            <div className="v">{fmtMoney(claim.reserve_amount)}</div>
          </div>
          <div>
            <div className="k">Approved Amount</div>
            <div className="v">{fmtMoney(claim.approved_amount)}</div>
          </div>
        </div>
      </div>

      </div>
      )}

      {tab === "insurer" && (
      <div role="tabpanel" id="claim-panel-insurer" aria-labelledby="claim-tab-insurer" tabIndex={0} className="exec-tabpanel">
      {transaction?.coinsurance && (
        <div className="card">
          <h2>Co-insurers</h2>
          <p className="page-lede">
            The policy is co-insured, so the loss is shared by its insurers in proportion to their shares of the risk. Register the loss with each.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Insurer</th>
                  <th>Credit note</th>
                  <th className="num">Share</th>
                  <th className="num">Claimed</th>
                  <th className="num">Reserve</th>
                  <th className="num">Approved</th>
                </tr>
              </thead>
              <tbody>
                {transaction.coinsurance.map((m, i, all) => (
                  <tr key={m.id}>
                    <td data-label="Insurer">
                      <Link to={`/transactions/${m.id}`}>{m.insurer}</Link>
                    </td>
                    <td data-label="Credit note">{m.credit_note_no || "—"}</td>
                    <td data-label="Share" className="num">{pct(m.proportion)}</td>
                    <td data-label="Claimed" className="num">{fmtMoney(sharesOf(claim.claimed_amount, all)[i])}</td>
                    <td data-label="Reserve" className="num">{fmtMoney(sharesOf(claim.reserve_amount, all)[i])}</td>
                    <td data-label="Approved" className="num">{fmtMoney(sharesOf(claim.approved_amount, all)[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card">
        <h2>Loss Registration with Insurer</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Insurer Claim Reference</div>
            <div className="v">{claim.insurer_claim_no || "Not yet registered"}</div>
          </div>
          <div>
            <div className="k">Date Notified to Insurer</div>
            <div className="v">{claim.date_notified_to_insurer || "—"}</div>
          </div>
          <div>
            <div className="k">Discharge Voucher No</div>
            <div className="v">{claim.discharge_voucher_no || "—"}</div>
          </div>
        </div>

        <RoleGate need="write">
          <form onSubmit={handleRegisterLoss} style={{ marginTop: "1rem" }}>
            <div className="section-title">
              {claim.insurer_claim_no ? "Update loss registration" : "Register loss with insurer"}
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="insurer_claim_no">Insurer Claim Reference</label>
                <input
                  id="insurer_claim_no"
                  value={insurerClaimNo}
                  onChange={(e) => setInsurerClaimNo(e.target.value)}
                  placeholder={claim.insurer_claim_no || "e.g. LEAD/MOT/2026/00123"}
                />
              </div>
              <div className="field">
                <label htmlFor="date_notified">Date Notified to Insurer</label>
                <input id="date_notified" type="date" value={dateNotified} onChange={(e) => setDateNotified(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Saving…" : "Register Loss"}
              </button>
            </div>
          </form>
        </RoleGate>
      </div>

      <div className="card">
        <h2>Loss Adjuster</h2>
        {!claim.adjuster_name ? (
          <p className="exec-state">
            No loss adjuster assigned yet.{" "}
            <RoleGate need="write">
              <Link to={`/claims/${claim.id}/edit`}>Assign one</Link>
            </RoleGate>
          </p>
        ) : (
          <>
            <div className="detail-grid">
              <div>
                <div className="k">Firm</div>
                <div className="v">
                  {lossAdjuster ? (
                    <>
                      <Link to={`/loss-adjusters?preview=${lossAdjuster.id}`}>{claim.adjuster_name}</Link>
                      {lossAdjuster.adjuster_ref && <span className="exec-dl-note"> · {lossAdjuster.adjuster_ref}</span>}
                    </>
                  ) : (
                    claim.adjuster_name
                  )}
                </div>
              </div>
              <div>
                <div className="k">Contact person</div>
                <div className="v">{lossAdjuster?.contact_person || "—"}</div>
              </div>
              <div>
                <div className="k">Phone</div>
                <div className="v">{adjusterPhone || "—"}</div>
              </div>
              <div>
                <div className="k">Email</div>
                <div className="v">
                  {adjusterEmails.length
                    ? adjusterEmails.map((e) => (
                        <div key={e}>
                          <a href={`mailto:${e}`}>{e}</a>
                        </div>
                      ))
                    : "—"}
                </div>
              </div>
              {lossAdjuster && (
                <>
                  <div>
                    <div className="k">Office address</div>
                    <div className="v">{lossAdjuster.address || "—"}</div>
                  </div>
                  <div>
                    <div className="k">NAICOM licence</div>
                    <div className="v">
                      {[lossAdjuster.licence_no, lossAdjuster.licence_status].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </>
              )}
            </div>
            {!lossAdjuster && (
              <p className="field-hint" style={{ marginTop: "0.75rem" }}>
                This adjuster isn't in the loss adjusters directory, so no address or NAICOM licence is on file. Pick the firm
                from the directory when editing the claim to link them.
              </p>
            )}
            {lossAdjuster && lossAdjuster.licence_status !== "Active" && (
              <p className="field-hint" style={{ marginTop: "0.75rem" }}>
                NAICOM licence {lossAdjuster.licence_status === "Not verified" ? "not yet verified" : lossAdjuster.licence_status.toLowerCase()} for this firm.
              </p>
            )}
          </>
        )}
      </div>

      </div>
      )}

      {tab === "documents" && (
      <div role="tabpanel" id="claim-panel-documents" aria-labelledby="claim-tab-documents" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Supporting Documents</h2>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">No documents uploaded yet.</td>
                </tr>
              )}
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.doc_type}</td>
                  <td>{d.title || "—"}</td>
                  <td>{d.uploaded_by || "—"}</td>
                  <td>{(d.uploaded_at || "").slice(0, 10)}</td>
                  <td>
                    <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/documents/${d.id}/file`)} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <RoleGate need="write">
          <form onSubmit={handleUploadDocument} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="doc_type">Document Type</label>
                <select id="doc_type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="">— Select —</option>
                  {data.docTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <RoleGate need="admin">
                  <small>
                    Type missing? <Link to="/document-types?area=claim">Manage claim document types</Link>
                  </small>
                </RoleGate>
              </div>
              <div className="field">
                <label htmlFor="doc_title">Title (optional)</label>
                <input id="doc_title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="doc_file">File (PDF, PNG, JPG)</label>
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
        </RoleGate>
      </div>

      </div>
      )}

      {tab === "service" && (
      <div role="tabpanel" id="claim-panel-service" aria-labelledby="claim-tab-service" tabIndex={0} className="exec-tabpanel">
        <ClaimServicePanel claimId={String(claimId)} stages={data.service?.stages ?? []} reserve={Number(claim.reserve_amount) || 0} movements={data.reserveMovements ?? []} />
      </div>
      )}

      {tab === "money" && data.claimMoney && (
      <div role="tabpanel" id="claim-panel-money" aria-labelledby="claim-tab-money" tabIndex={0} className="exec-tabpanel">
        <ClaimMoneyPanel claimId={String(claimId)} money={data.claimMoney} approvedAmount={Number(claim.approved_amount) || 0} />
      </div>
      )}

      {tab === "history" && (
      <div role="tabpanel" id="claim-panel-history" aria-labelledby="claim-tab-history" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Claim History</h2>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No events logged.</td>
                </tr>
              )}
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.event_date || "—"}</td>
                  <td>
                    <StatusBadge status={ev.status} />
                  </td>
                  <td>{ev.note || "—"}</td>
                  <td>{ev.created_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <RoleGate need="write">
          <form onSubmit={handleAddEvent} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="event_status">Update status</label>
                <select id="event_status" value={eventStatus || claim.status} onChange={(e) => setEventStatus(e.target.value)}>
                  {data.statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="note">Note</label>
                <input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Adding…" : "Add update"}
              </button>
            </div>
          </form>
        </RoleGate>
      </div>
      </div>
      )}
      </section>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";

interface QuoteRequest {
  id: number;
  client_id: number | null;
  client_name: string;
  source: string;
  reference: string | null;
  contact_name: string | null;
  company_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  insurer_name: string | null;
  notification_log: string | null;
  request_type: string;
  class_of_business: string | null;
  subject_matter: string | null;
  sum_insured_estimate: number;
  details: string | null;
  status: string;
  created_at: string;
  staff_notes: string | null;
  handled_by: string | null;
  handled_at: string | null;
  deal_id: number | null;
  /** The customer portal request this row belongs to: it is handled on that page. */
  portal_request_id?: number | null;
}

interface Response {
  qr: QuoteRequest;
  answers: { title: string; lines: { label: string; value: string }[] }[];
  statuses: string[];
}

interface Candidate {
  client_id: number;
  name: string;
}

export function QuoteRequestDetailPage() {
  const { qrId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [staffNotes, setStaffNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A website request has no client yet: when the prospect looks like an existing client, staff pick one.
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  // Converting creates a deal and closes the request, so the admin confirms the request's details first.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quote-requests", qrId],
    queryFn: () => api.get<Response>(`/api/quote-requests/${qrId}`),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Quote request not found.</p>;
  const { qr } = data;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if ((status || qr.status) === "Converted" && !qr.deal_id) {
      setConfirmOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/quote-requests/${qrId}/update`, {
        status: status || qr.status,
        staff_notes: staffNotes || qr.staff_notes || "",
      });
      await queryClient.invalidateQueries({ queryKey: ["quote-requests", qrId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConvert(choice: { client_id?: number; confirm_new?: boolean } = {}) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ dealId: number }>(`/api/quote-requests/${qrId}/convert`, choice);
      setConfirmOpen(false);
      // Notes typed before converting from the status form are kept (the request is Converted by now).
      if (staffNotes && staffNotes !== (qr.staff_notes || "")) {
        await api.post(`/api/quote-requests/${qrId}/update`, { status: "Converted", staff_notes: staffNotes });
      }
      await queryClient.invalidateQueries({ queryKey: ["quote-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
      navigate(`/deals/${result.dealId}`);
    } catch (err) {
      const found = err instanceof ApiError ? (err.data?.candidates as Candidate[] | undefined) : undefined;
      setConfirmOpen(false);
      if (found?.length) setCandidates(found);
      const missing = (err instanceof ApiError ? (err.data?.missing as { message: string }[] | undefined) : undefined) ?? [];
      setError(err instanceof ApiError ? [err.message, ...missing.map((m) => m.message)].join(" ") : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {qr.portal_request_id && (
        <div className="flash flash-info">
          This is a customer portal request. Its quote, payment, policy and deal are handled on{" "}
          <Link to={`/portal/quote-requests/${qr.portal_request_id}`}>its portal page →</Link>
        </div>
      )}
      <div className="page-header">
        <div>
          <p className="eyebrow">
            {qr.client_id ? <Link to={`/clients/${qr.client_id}`}>{qr.client_name}</Link> : <>{qr.client_name} (website prospect)</>}
          </p>
          <h1>{qr.reference ? `${qr.reference} · ` : ""}{qr.request_type} Request</h1>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={qr.status} />
          {qr.deal_id ? (
            <Link className="btn btn-sm" to={`/deals/${qr.deal_id}`}>Open deal</Link>
          ) : (
            <RoleGate need="write">
              <button type="button" className="btn btn-sm" onClick={() => setConfirmOpen(true)} disabled={submitting || qr.status === "Declined"}>Convert to deal</button>
            </RoleGate>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title="Confirm this request before converting"
        onClose={() => setConfirmOpen(false)}
        footer={<>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-sm" onClick={() => handleConvert()} disabled={submitting}>
            {submitting ? "Converting…" : "Confirm and convert"}
          </button>
        </>}
      >
        <p className="text-muted">Check the request is genuine and complete. Converting it:</p>
        <ul className="text-muted">
          <li>creates a deal in the Pipeline with these details,</li>
          <li>{qr.client_id ? <>links it to the client <strong>{qr.client_name}</strong>,</> : <>links it to an existing client or creates <strong>{qr.company_name || qr.contact_name || "the prospect"}</strong> as a new prospect,</>}</li>
          <li>marks this request <strong>Converted</strong> (the customer sees this).</li>
        </ul>
        <div className="detail-grid">
          <div><div className="k">{qr.client_id ? "Client" : "Prospect"}</div><div className="v">{qr.client_name}</div></div>
          {!qr.client_id && <div><div className="k">Contact</div><div className="v">{[qr.contact_email, qr.contact_phone].filter(Boolean).join(" · ") || "—"}</div></div>}
          <div><div className="k">Class of Business</div><div className="v">{qr.class_of_business || "—"}</div></div>
          <div><div className="k">Subject Matter</div><div className="v">{qr.subject_matter || "—"}</div></div>
          <div><div className="k">Estimated Sum Insured</div><div className="v">{fmtMoney(qr.sum_insured_estimate)}</div></div>
          <div><div className="k">Preferred insurer</div><div className="v">{qr.insurer_name || "No preference"}</div></div>
          <div><div className="k">Submitted</div><div className="v">{(qr.created_at || "").slice(0, 10)}</div></div>
          <div><div className="k">Current status</div><div className="v">{qr.status}</div></div>
        </div>
      </Modal>

      {candidates && !qr.deal_id && (
        <div className="card">
          <h2>Is this an existing client?</h2>
          <p className="text-muted">The prospect's name matches clients already on file. Link the deal to one of them, or create a new prospect.</p>
          <div className="form-actions">
            {candidates.map((c) => (
              <button key={c.client_id} type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => handleConvert({ client_id: c.client_id })}>
                Use {c.name}
              </button>
            ))}
            <button type="button" className="btn btn-sm" disabled={submitting} onClick={() => handleConvert({ confirm_new: true })}>
              Create new prospect
            </button>
          </div>
        </div>
      )}

      {qr.source === "marketplace" && (
        <div className="card">
          <h2>Website request</h2>
          <div className="detail-grid">
            <div><div className="k">Contact</div><div className="v">{qr.contact_name || "—"}</div></div>
            {qr.company_name && <div><div className="k">Company</div><div className="v">{qr.company_name}</div></div>}
            <div><div className="k">Email</div><div className="v">{qr.contact_email ? <a href={`mailto:${qr.contact_email}`}>{qr.contact_email}</a> : "—"}</div></div>
            <div><div className="k">Mobile</div><div className="v">{qr.contact_phone ? <a href={`tel:${qr.contact_phone}`}>{qr.contact_phone}</a> : "—"}</div></div>
            <div><div className="k">Preferred insurer</div><div className="v">{qr.insurer_name || "No preference"}</div></div>
            {qr.notification_log && (
              <div className="span-2"><div className="k">Emails</div><div className="v" style={{ whiteSpace: "pre-line" }}>{qr.notification_log}</div></div>
            )}
          </div>
        </div>
      )}

      {data.answers.map((section) => (
        <div className="card" key={section.title}>
          <h2>{section.title}</h2>
          <div className="detail-grid">
            {section.lines.map((line) => (
              <div key={line.label} className={line.value.length > 60 ? "span-2" : undefined}>
                <div className="k">{line.label}</div>
                <div className="v" style={{ whiteSpace: "pre-line" }}>{line.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <div className="detail-grid">
          <div>
            <div className="k">Class of Business</div>
            <div className="v">{qr.class_of_business || "—"}</div>
          </div>
          <div>
            <div className="k">Subject Matter</div>
            <div className="v">{qr.subject_matter || "—"}</div>
          </div>
          <div>
            <div className="k">Estimated Sum Insured</div>
            <div className="v">{fmtMoney(qr.sum_insured_estimate)}</div>
          </div>
          <div>
            <div className="k">Submitted</div>
            <div className="v">{(qr.created_at || "").slice(0, 10)}</div>
          </div>
          <div className="span-2">
            <div className="k">Details</div>
            <div className="v">{qr.details || "—"}</div>
          </div>
          {qr.handled_by && (
            <div className="span-2">
              <div className="k">Last handled</div>
              <div className="v">{qr.handled_by} — {(qr.handled_at || "").slice(0, 10)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Update Status</h2>
        <RoleGate need="write">
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" value={status || qr.status} onChange={(e) => setStatus(e.target.value)}>
                  {data.statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label htmlFor="staff_notes">Staff notes</label>
                <textarea
                  id="staff_notes"
                  rows={3}
                  value={staffNotes || qr.staff_notes || ""}
                  onChange={(e) => setStaffNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Saving…" : (status || qr.status) === "Converted" && !qr.deal_id ? "Convert to deal…" : "Save"}
              </button>
            </div>
          </form>
        </RoleGate>
      </div>
    </div>
  );
}

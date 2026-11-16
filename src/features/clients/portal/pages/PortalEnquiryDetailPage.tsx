import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { dateTime } from "../api";
import { ENQUIRY_STATUS_LABELS, type EnquiryRow } from "./PortalEnquiriesPage";

interface Reply {
  id: number;
  message: string;
  sent_to: string;
  sent_by: string | null;
  created_at: string | null;
}

interface Detail extends Omit<EnquiryRow, "reply_count"> {
  replies: Reply[];
  customer: { id: number; name: string; email: string; phone: string | null; client_id: number | null } | null;
}

const REPLY_MAX = 5000;

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function PortalEnquiryDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reply" | "reply-resolve" | "status" | null>(null);
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["portal-enquiry", id],
    queryFn: () => api.get<{ data: Detail }>(`/api/customer-enquiries/${id}`),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["portal-enquiry", id] });
    await queryClient.invalidateQueries({ queryKey: ["portal-enquiries"] });
  }

  async function sendReply(resolve: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!message.trim()) {
      setError("Write the message to send.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(resolve ? "reply-resolve" : "reply");
    try {
      await api.post(`/api/customer-enquiries/${id}/reply`, { message, resolve });
      setMessage("");
      setNotice(resolve ? "Reply emailed and the enquiry marked resolved." : "Reply emailed to the customer.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: "pending" | "resolved") {
    setError(null);
    setNotice(null);
    setBusy("status");
    try {
      await api.patch(`/api/customer-enquiries/${id}/status`, { status });
      setNotice(status === "resolved" ? "Marked resolved." : "Reopened: the enquiry needs attention again.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p>Loading…</p>;
  const q = data?.data;
  if (!q) return <p>Enquiry not found.</p>;
  const resolved = q.status === "resolved";

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/portal/enquiries">Contact Enquiries</Link></p>
          <h1>{q.reference}</h1>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={ENQUIRY_STATUS_LABELS[q.status] ?? q.status} />
          <RoleGate need="write">
            <button type="button" className={resolved ? "btn btn-secondary" : "btn"} disabled={busy !== null} onClick={() => setStatus(resolved ? "pending" : "resolved")}>
              {busy === "status" ? "Saving…" : resolved ? "Reopen" : "Mark as resolved"}
            </button>
          </RoleGate>
        </div>
      </div>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      {notice && <div className="flash flash-success" role="status">{notice}</div>}

      <div className="card">
        <h2>Enquiry</h2>
        <div className="detail-grid">
          <Field label="From" value={<>{q.full_name}<div className="muted small"><a href={`mailto:${q.email}`}>{q.email}</a>{q.phone ? ` · ${q.phone}` : ""}</div></>} />
          <Field label="Received" value={dateTime(q.created_at)} />
          <Field label="Topic" value={q.topic} />
          <Field label="Policy / claim reference" value={q.policy_reference} />
          <Field
            label="Portal account"
            value={q.customer ? <>{q.customer.name}{q.customer.client_id ? <div className="muted small"><Link to={`/clients/${q.customer.client_id}`}>Client record</Link></div> : <div className="muted small">Not linked to a client yet</div>}</> : "Not signed in"}
          />
          {resolved && <Field label="Resolved" value={`${q.resolved_by ?? "—"} · ${dateTime(q.resolved_at)}`} />}
          <div className="span-2"><div className="k">Message</div><div className="v" style={{ whiteSpace: "pre-line" }}>{q.message}</div></div>
        </div>
      </div>

      <div className="card">
        <h2>Replies</h2>
        {q.replies.length === 0 ? (
          <p className="muted">No reply sent yet.</p>
        ) : (
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
            {q.replies.map((r) => (
              <li key={r.id} style={{ borderLeft: "3px solid var(--border, #d8ded9)", paddingLeft: "0.75rem" }}>
                <div className="muted small">{r.sent_by ?? "Staff"} · {dateTime(r.created_at)} · emailed to {r.sent_to}</div>
                <div style={{ whiteSpace: "pre-line" }}>{r.message}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <RoleGate need="write">
        <div className="card">
          <h2>Reply to {q.full_name}</h2>
          <p className="page-lede">Your message is emailed to {q.email} with the enquiry reference. If they answer that email, it goes to the company inbox.</p>
          <form onSubmit={(e) => sendReply(false, e)}>
            <div className="field">
              <label htmlFor="enq-reply">Message</label>
              <textarea id="enq-reply" rows={6} maxLength={REPLY_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your reply to the customer…" />
              <span className="muted small">{message.length}/{REPLY_MAX}</span>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy !== null || !message.trim()}>{busy === "reply" ? "Sending…" : "Send reply"}</button>
              {!resolved && (
                <button type="button" className="btn btn-secondary" disabled={busy !== null || !message.trim()} onClick={() => sendReply(true)}>
                  {busy === "reply-resolve" ? "Sending…" : "Send and mark resolved"}
                </button>
              )}
            </div>
          </form>
        </div>
      </RoleGate>
    </div>
  );
}

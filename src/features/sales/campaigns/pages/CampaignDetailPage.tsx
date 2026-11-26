import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";

interface Campaign {
  id: number;
  name: string;
  channel: string;
  status: string;
  source_type: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  description: string | null;
}

interface Recipient {
  id: number;
  name: string | null;
  email: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  engagement_score: number;
  escalated_at: string | null;
  escalated_to_name: string | null;
}

interface Response {
  campaign: Campaign;
  recipients: Recipient[];
}

export function CampaignDetailPage() {
  const { campaignId } = useParams();
  const queryClient = useQueryClient();
  const [manualRecipients, setManualRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId],
    queryFn: () => api.get<Response>(`/api/campaigns/${campaignId}`),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
  }

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Campaign not found.</p>;
  const { campaign, recipients } = data;

  async function handleAddRecipients(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ added: number }>(`/api/campaigns/${campaignId}/recipients`, { manual_recipients: manualRecipients });
      setManualRecipients("");
      await refresh();
      alert(`${result.added} recipient(s) added.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ sentCount: number; emailCount: number; channel: string }>(`/api/campaigns/${campaignId}/send`, {
        subject: subject || campaign.name, body_html: bodyHtml, body_text: bodyText,
      });
      await refresh();
      if (result.channel === "Email") {
        alert(`Marked ${result.sentCount} recipient(s) as sent — ${result.emailCount} actual email(s) sent through Resend (the rest had no email on file, or Resend isn't configured).`);
      } else {
        alert(`Logged ${result.sentCount} ${result.channel} send(s) in the CRM — no live ${result.channel} provider is configured, so nothing was actually transmitted.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{campaign.channel} campaign</p>
          <h1>
            {campaign.name} <StatusBadge status={campaign.status} />
          </h1>
        </div>
        <Link className="btn-secondary btn" to="/campaigns">← All campaigns</Link>
      </div>

      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <div className="detail-grid">
          <div>
            <div className="k">Source</div>
            <div className="v">{campaign.source_type || "—"}</div>
          </div>
          <div>
            <div className="k">Dates</div>
            <div className="v">{campaign.start_date || "—"} – {campaign.end_date || "—"}</div>
          </div>
          <div>
            <div className="k">Budget</div>
            <div className="v">{fmtMoney(campaign.budget)}</div>
          </div>
          <div>
            <div className="k">Recipients</div>
            <div className="v">{recipients.length}</div>
          </div>
        </div>
        {campaign.description && <p style={{ marginTop: "1rem" }}>{campaign.description}</p>}
      </div>

      <RoleGate need="write">
        <div className="card">
          <h2>Add Recipients</h2>
          <form onSubmit={handleAddRecipients}>
            <div className="form-grid">
              <div className="field span-3">
                <label htmlFor="manual_recipients">Manual list — one per line, "name, email"</label>
                <textarea id="manual_recipients" rows={3} placeholder="Jane Doe, jane@example.com" value={manualRecipients} onChange={(e) => setManualRecipients(e.target.value)} />
              </div>
            </div>
            <p className="page-lede">
              To add accounts from a filtered list instead, use <Link to="/crm/segments">Segmentation</Link> and check accounts there to start a new campaign directly, or come back here after noting client IDs.
            </p>
            <div className="form-actions">
              <button type="submit" className="btn-secondary btn" disabled={busy}>Add recipients</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Send</h2>
          <form onSubmit={handleSend}>
            <div className="form-grid">
              <div className="field span-3">
                <label htmlFor="subject">Subject / headline</label>
                <input id="subject" value={subject || campaign.name} onChange={(e) => setSubject(e.target.value)} />
              </div>
              {campaign.channel === "Email" ? (
                <>
                  <div className="field span-3">
                    <label htmlFor="body_html">Email body (HTML)</label>
                    <textarea id="body_html" rows={6} placeholder="<p>Hello, ...</p>" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
                  </div>
                  <div className="field span-3">
                    <label htmlFor="body_text">Plain-text fallback</label>
                    <textarea id="body_text" rows={3} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="field span-3">
                  <label htmlFor="body_text">Message content (logged only — no {campaign.channel} provider is configured)</label>
                  <textarea id="body_text" rows={3} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>Send to unsent recipients</button>
            </div>
          </form>
        </div>
      </RoleGate>

      <div className="card">
        <h2>Recipients &amp; Engagement</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Sent</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th className="num">Engagement</th>
                <th>Escalated To</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">No recipients added yet.</td>
                </tr>
              )}
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || "—"}</td>
                  <td>{r.email || "—"}</td>
                  <td>{(r.sent_at || "").slice(0, 10) || "—"}</td>
                  <td>{(r.opened_at || "").slice(0, 10) || "—"}</td>
                  <td>{(r.clicked_at || "").slice(0, 10) || "—"}</td>
                  <td className="num">{Math.round(r.engagement_score)}</td>
                  <td>{r.escalated_to_name || (r.escalated_at ? "Needs pickup" : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtWhen } from "../messageTypes";

interface InboundRow {
  id: number;
  received_at: string;
  from_address: string | null;
  subject: string | null;
  outcome: "added" | "held" | "ignored" | "failed";
  thread_id: number | null;
  detail: string | null;
}

interface Status {
  domain: string | null;
  resendKey: boolean;
  webhookSecret: boolean;
  webhookUrl: string;
  recent: InboundRow[];
}

const OUTCOME: Record<InboundRow["outcome"], string> = {
  added: "Added to the conversation",
  held: "Held for staff to check (sender not on file)",
  ignored: "Ignored",
  failed: "Failed",
};

function Step({ done, n, title, children }: { done: boolean; n: number; title: string; children: React.ReactNode }) {
  return (
    <li className={`setup-step${done ? " is-done" : ""}`}>
      <span className="setup-step-mark" aria-hidden="true">{done ? "✓" : n}</span>
      <div>
        <h3>{title} {done && <span className="sr-text">(done)</span>}</h3>
        {children}
      </div>
    </li>
  );
}

/** Admin: switch on client replies by email (Resend receiving) and see what has arrived. */
export function EmailRepliesSetupPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["client-messages", "email-setup"],
    queryFn: () => api.get<Status>("/api/client-messages/email-setup"),
  });

  async function connect() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ id: string | null; signingSecret: string | null }>("/api/client-messages/email-setup/connect");
      setSigningSecret(res.signingSecret);
      setNotice(`Connected. Resend will now send replies here${res.id ? ` (webhook ${res.id})` : ""}. Send yourself a test: reply to a message emailed from a conversation.`);
      await queryClient.invalidateQueries({ queryKey: ["client-messages", "email-setup"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect to Resend.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data) return <p>Loading…</p>;
  const sub = data.domain ? data.domain.split(".")[0] : "reply";
  const received = data.recent.some((r) => r.outcome === "added" || r.outcome === "held");

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/client-messages">Client Messages</Link></p>
          <h1>Email replies setup</h1>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", maxWidth: "46rem" }}>
            When this is on, a client can answer a message you send them by simply replying to the email. Their reply, with any attachments, lands in the same conversation here and in their portal.
          </p>
        </div>
      </div>

      {notice && <div className="flash flash-success">{notice}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <ol className="setup-steps">
          <Step n={1} done={Boolean(data.domain)} title="Choose the reply address domain (Render)">
            {data.domain ? (
              <p>Replies go to addresses at <strong>{data.domain}</strong>.</p>
            ) : (
              <p>
                In Render, open the API service, then <em>Environment</em>, and add <code>INBOUND_EMAIL_DOMAIN</code> with the value{" "}
                <code>reply.greenpacificng.com</code>. Save, let it redeploy, then reload this page.
              </p>
            )}
          </Step>
          <Step n={2} done={data.resendKey} title="Resend API key (Render)">
            <p>{data.resendKey ? "RESEND_API_KEY is set." : "Add RESEND_API_KEY in Render (the same key used to send email)."}</p>
          </Step>
          <Step n={3} done={received} title="Receive the reply sub-domain in Resend (Resend, then your DNS host)">
            <p>
              In Resend, open <em>Domains</em>, add <code>{data.domain || "reply.greenpacificng.com"}</code> and switch on <strong>Receiving</strong> for it.
              Resend shows an <strong>MX record</strong> for it. Add exactly that at the place that runs DNS for greenpacificng.com
              (cPanel → Zone Editor, or your registrar/Cloudflare):
            </p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Name</th><th>Value</th><th>Priority</th></tr></thead>
                <tbody>
                  <tr><td>MX</td><td>{sub}</td><td>as shown in Resend for the receiving record</td><td>as shown in Resend</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="msg-help" style={{ paddingLeft: "1.1rem" }}>
              <li>Remove any other MX record named <code>{sub}</code> first.</li>
              <li>Don&apos;t change the MX records of greenpacificng.com itself, so enquiries@greenpacificng.com keeps working.</li>
              <li>Changes can take a few hours to spread. Resend marks the record as verified once it sees it.</li>
            </ul>
          </Step>
          <Step n={4} done={received} title="Connect Resend to the ERP">
            <p>Once Resend shows the receiving record as verified, this tells Resend where to deliver the replies it receives for {data.domain || "the domain"}.</p>
            <button type="button" className="btn" onClick={connect} disabled={busy || !data.domain || !data.resendKey}>
              {busy ? "Connecting…" : "Connect Resend"}
            </button>
            <details style={{ marginTop: "0.75rem" }}>
              <summary>Set it up by hand instead</summary>
              <p className="msg-help">In Resend, open <em>Webhooks</em>, add this URL as an endpoint for the <code>email.received</code> event, and copy its signing secret into step 5. Keep the URL private: it lets mail into the ERP.</p>
              <code style={{ wordBreak: "break-all" }}>{data.webhookUrl}</code>
            </details>
          </Step>
          <Step n={5} done={data.webhookSecret} title="Save the webhook signing secret (Render)">
            {data.webhookSecret ? (
              <p>RESEND_WEBHOOK_SECRET is set: every delivery from Resend must carry its signature.</p>
            ) : (
              <>
                <p>
                  In Render, add <code>RESEND_WEBHOOK_SECRET</code> with the webhook&apos;s signing secret (it starts with <code>whsec_</code>), so only
                  Resend can deliver mail here.
                </p>
                {signingSecret && (
                  <p>
                    Signing secret (shown once, copy it now): <code style={{ wordBreak: "break-all" }}>{signingSecret}</code>
                  </p>
                )}
              </>
            )}
          </Step>
        </ol>
      </div>

      <div className="card">
        <h2>Latest emails received</h2>
        {data.recent.length === 0 ? (
          <p className="empty-state">No email replies have arrived yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Received</th><th>From</th><th>Subject</th><th>What happened</th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtWhen(r.received_at)}</td>
                    <td>{r.from_address || "—"}</td>
                    <td>{r.thread_id ? <Link to={`/client-messages/${r.thread_id}`}>{r.subject || "(no subject)"}</Link> : r.subject || "(no subject)"}</td>
                    <td>{OUTCOME[r.outcome]}{r.detail ? `: ${r.detail}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

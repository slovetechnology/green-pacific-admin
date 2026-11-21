import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Digest } from "../api";
import { useIsAdmin } from "../access";
import { Empty, ErrorNote, fmtDateTime, Loading, Modal, Pill } from "../components/ui";
import { confirmDialog } from "@/shared/components/Dialogs";

interface Preview {
  subject: string;
  html: string;
  text: string;
  leads: unknown[];
}

export function DigestsPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | "preview" | null>(null);
  const [force, setForce] = useState(false);
  const list = useQuery({ queryKey: ["lead-portal", "digests"], queryFn: () => api.get<Digest[]>("/digests") });
  const settings = useQuery({ queryKey: ["lead-portal", "settings"], queryFn: () => api.get<{ emailConfigured: boolean; digest_recipients: string }>("/settings") });

  const send = useMutation({
    mutationFn: () => api.post<{ runId: number; status: string }>("/runs", { mode: "send", force }),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["lead-portal", "digests"] });
        qc.invalidateQueries({ queryKey: ["lead-portal", "dashboard"] });
        qc.invalidateQueries({ queryKey: ["lead-portal", "runs"] });
      }, 1500);
    },
  });

  return (
    <div className="lp">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead Portal</p>
          <h1>Digests</h1>
          <p className="page-lede">
            The daily email to <strong>{settings.data?.digest_recipients?.split(",").join(", ") || "…"}</strong>. A company appears in a digest only once, ever.
          </p>
        </div>
        <div className="row gap">
          <button className="btn btn-secondary" onClick={() => setOpen("preview")}>Preview next digest</button>
          {isAdmin ? (
            <>
              <label className="check" title="Send even if a digest already went out in the last 20 hours">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Force
              </label>
              <button
                className="btn"
                disabled={send.isPending || !settings.data?.emailConfigured}
                title={settings.data?.emailConfigured ? "" : "Email is not set up on the server (RESEND_API_KEY)"}
                onClick={async () => (await confirmDialog("Send the digest now? The companies in it will never be sent again.")) && send.mutate()}
              >
                {send.isPending ? "Sending…" : "Send now"}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {settings.data && !settings.data.emailConfigured ? (
        <div className="alert alert-warn">Email isn't configured on the server (RESEND_API_KEY), so digests can be previewed but not sent.</div>
      ) : null}
      <ErrorNote error={send.error} />
      {send.isSuccess ? <div className="alert alert-success">Sending started. Check the Runs page for the result.</div> : null}

      <section className="card table-card">
        {list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="No digests yet" /> : (
          <table className="table clickable">
            <thead><tr><th>#</th><th>Subject</th><th>Status</th><th className="num">Leads</th><th>Sent</th><th>By</th></tr></thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.id} onClick={() => setOpen(d.id)}>
                  <td>{d.id}</td>
                  <td>{d.subject}</td>
                  <td>
                    <Pill tone={d.status === "sent" ? "ok" : d.status === "failed" ? "failed" : "muted"}>{d.status}</Pill>
                    {d.error ? <span className="text-error small"> {d.error}</span> : null}
                  </td>
                  <td className="num">{d.lead_count}</td>
                  <td>{fmtDateTime(d.sent_at || d.created_at)}</td>
                  <td className="muted">{d.sent_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open === "preview" ? <PreviewModal onClose={() => setOpen(null)} /> : open ? <DigestModal id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function EmailFrame({ html }: { html: string }) {
  // sandbox with no scripts: the digest is rendered exactly as a mail client would, isolated from the app
  return <iframe className="email-frame" title="Digest email" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} />;
}

function PreviewModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "digest-preview"], queryFn: () => api.get<Preview>("/digests/preview"), staleTime: 0 });
  return (
    <Modal title={data ? `Preview: ${data.subject}` : "Preview"} onClose={onClose} wide>
      <p className="muted small">What would be sent right now. Nothing is sent or marked by previewing.</p>
      {isLoading ? <Loading /> : error || !data ? <ErrorNote error={error} /> : <EmailFrame html={data.html} />}
    </Modal>
  );
}

function DigestModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["lead-portal", "digest", id], queryFn: () => api.get<Digest>(`/digests/${id}`) });
  return (
    <Modal title={data?.subject || `Digest #${id}`} onClose={onClose} wide>
      {isLoading ? <Loading /> : error || !data ? <ErrorNote error={error} /> : (
        <>
          <p className="muted small">To {data.recipients} · {data.status} {fmtDateTime(data.sent_at || data.created_at)}{data.error ? ` · ${data.error}` : ""}</p>
          {data.html_body ? <EmailFrame html={data.html_body} /> : <Empty title="No email body stored" />}
        </>
      )}
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { ConversationView } from "../components/ConversationView";
import { MessageComposer } from "../components/MessageComposer";
import type { ThreadDetail, ThreadMessage } from "../messageTypes";

interface ThreadResponse {
  thread: ThreadDetail & { client_name: string };
  messages: ThreadMessage[];
  suggestions: { name: string; email: string }[];
  defaultTo: string;
}

interface Options {
  categories: string[];
  users: { id: number; username: string }[];
}

/** One conversation with a client, with its settings (status, category, assignee) at the side. */
export function ClientMessageThreadPage() {
  const { threadId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-messages", "thread", threadId],
    queryFn: () => api.get<ThreadResponse>(`/api/client-messages/${threadId}`),
    // A client's reply (portal or email) arrives on the server, not here: check for it while the page is open, and
    // on coming back to the tab (the app turns focus refetching off by default). Paused while the tab is hidden.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const options = useQuery({
    queryKey: ["client-messages", "compose-options"],
    queryFn: () => api.get<Options>("/api/client-messages/compose-options"),
  }).data;

  // Opening it marks it read: refresh the list and the sidebar badge.
  useEffect(() => {
    if (!data) return;
    queryClient.invalidateQueries({ queryKey: ["nav-summary"] });
  }, [data, queryClient]);

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Conversation not found. <Link to="/client-messages">Back to Client Messages</Link></p>;
  const { thread, messages } = data;
  const canWrite = Boolean(user?.canWrite);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["client-messages"] });
    await queryClient.invalidateQueries({ queryKey: ["nav-summary"] });
  }

  async function save(path: string, body: unknown, done: string) {
    setError(null);
    setNotice(null);
    try {
      await api.put(`/api/client-messages/${threadId}/${path}`, body);
      await refresh();
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the change.");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/client-messages">Client Messages</Link> · <Link to={`/clients/${thread.client_id}?tab=messages`}>{thread.client_name}</Link>
          </p>
          <h1>{thread.subject}</h1>
          <div className="msg-chips" style={{ justifyContent: "flex-start", marginTop: "0.35rem" }}>
            <span className="msg-chip">{thread.topic}</span>
            {thread.started_by === "system" && <span className="msg-chip">Email copy</span>}
            {thread.status === "Closed" ? <span className="msg-chip tone-muted">Closed</span> : thread.needs_reply ? <span className="msg-chip tone-warn">Awaiting reply</span> : null}
          </div>
        </div>
      </div>

      {notice && <div className="flash flash-success">{notice}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="msg-layout">
        <div className="card">
          <ConversationView messages={messages} viewer="staff" attachmentPath={(id) => `/api/client-messages/attachments/${id}`} />
          {canWrite ? (
            <MessageComposer
              key={thread.id}
              staff
              allowNote
              defaultEmailTo={data.defaultTo}
              emailSuggestions={data.suggestions}
              submitLabel="Send reply"
              placeholder="Write your reply to the client…"
              onSend={async (form) => {
                setNotice(null);
                const res = await api.upload<{ emailStatus: string | null }>(`/api/client-messages/${threadId}/messages`, form);
                await refresh();
                setNotice(form.get("kind") === "note" ? "Note saved. The client can't see it." : res.emailStatus ? `Reply saved. ${res.emailStatus.replace(/\.$/, "")}.` : "Reply saved to the conversation (not emailed).");
              }}
            />
          ) : (
            <p className="msg-help">You can read this conversation. Replying needs editor access.</p>
          )}
        </div>

        <aside className="card msg-side" aria-label="Conversation settings">
          <div className="field">
            <label htmlFor="msg-status">Status</label>
            <select id="msg-status" value={thread.status} disabled={!canWrite} onChange={(e) => save("status", { status: e.target.value }, e.target.value === "Closed" ? "Conversation closed." : "Conversation reopened.")}>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="msg-category">Category</label>
            <select id="msg-category" value={thread.category || ""} disabled={!canWrite} onChange={(e) => save("category", { category: e.target.value || null }, "Category saved.")}>
              <option value="">Not categorised</option>
              {(options?.categories ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <small className="msg-help">Complaints count towards the account manager's complaint-rate KPI.</small>
          </div>
          <div className="field">
            <label htmlFor="msg-assign">Assigned to</label>
            <select id="msg-assign" value={thread.assigned_user_id ?? ""} disabled={!canWrite} onChange={(e) => save("assign", { user_id: e.target.value ? Number(e.target.value) : null }, "Assignment saved.")}>
              <option value="">Nobody</option>
              {(options?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          <dl>
            <dt>Client</dt>
            <dd><Link to={`/clients/${thread.client_id}`}>{thread.client_name}</Link></dd>
            {thread.policy && (
              <>
                <dt>Policy</dt>
                <dd><Link to={`/transactions/${thread.policy.id}`}>{[thread.policy.class_of_business, thread.policy.policy_no].filter(Boolean).join(" · ") || `#${thread.policy.id}`}</Link></dd>
              </>
            )}
            {thread.claim && (
              <>
                <dt>Claim</dt>
                <dd><Link to={`/claims/${thread.claim.id}`}>{thread.claim.claim_no}</Link></dd>
              </>
            )}
            <dt>Started by</dt>
            <dd>{thread.started_by === "client" ? "The client" : thread.started_by === "broker" ? "Staff" : "System email"}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}

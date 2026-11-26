import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { ConversationView } from "@/features/clients/messages/components/ConversationView";
import { MessageComposer } from "@/features/clients/messages/components/MessageComposer";
import type { ThreadDetail, ThreadMessage } from "@/features/clients/messages/messageTypes";

export function PortalMessageThreadPage() {
  const { threadId } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const justSent = searchParams.get("sent") === "1";

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "messages", threadId],
    queryFn: () => api.get<{ thread: ThreadDetail; messages: ThreadMessage[] }>(`/api/portal/messages/${threadId}`),
  });

  // Opening the conversation marks it read: refresh the counts in the list and the menu.
  useEffect(() => {
    if (!data) return;
    queryClient.invalidateQueries({ queryKey: ["portal", "messages-unread"] });
    queryClient.invalidateQueries({ queryKey: ["portal", "messages"], exact: true });
  }, [data, queryClient]);

  if (isLoading) return <p>Loading…</p>;
  if (!data) {
    return (
      <div className="card">
        <p>{error instanceof ApiError && error.status === 404 ? "This conversation could not be found." : "The conversation could not be loaded."}</p>
        <Link to="/portal/messages">Back to Messages</Link>
      </div>
    );
  }
  const { thread, messages } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/portal/messages">Messages</Link></p>
          <h1>{thread.subject}</h1>
          <div className="msg-chips" style={{ justifyContent: "flex-start", marginTop: "0.35rem" }}>
            <span className="msg-chip">{thread.topic}</span>
            {thread.policy && (
              <span className="msg-chip">Policy {thread.policy.policy_no || thread.policy.class_of_business}</span>
            )}
            {thread.claim && (
              <Link className="msg-chip" to={`/portal/claims/${thread.claim.id}`}>Claim {thread.claim.claim_no}</Link>
            )}
            {thread.status === "Closed" && <span className="msg-chip tone-muted">Closed</span>}
          </div>
        </div>
      </div>

      {justSent && <div className="flash flash-success">Message sent. Your broker will reply here, and we'll email you when they do.</div>}

      <div className="card">
        <ConversationView messages={messages} viewer="client" attachmentPath={(id) => `/api/portal/messages/attachments/${id}`} />
        {thread.status === "Closed" && (
          <p className="msg-help">This conversation was closed by your broker. Writing again will reopen it.</p>
        )}
        <MessageComposer
          submitLabel="Send reply"
          placeholder="Write your reply…"
          onSend={async (form) => {
            await api.upload(`/api/portal/messages/${threadId}/reply`, form);
            await queryClient.invalidateQueries({ queryKey: ["portal", "messages"] });
          }}
        />
      </div>
    </div>
  );
}

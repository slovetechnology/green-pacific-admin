import { apiUrl } from "@/shared/api/client";
import { fmtSize, fmtWhen, type ThreadMessage } from "../messageTypes";

/**
 * The messages of one conversation, oldest first. The viewer's own side sits on the right:
 * the client's messages in the portal, the broker's (and staff notes) in the staff app.
 */
export function ConversationView({
  messages,
  viewer,
  attachmentPath,
}: {
  messages: ThreadMessage[];
  viewer: "client" | "staff";
  attachmentPath: (attachmentId: number) => string;
}) {
  if (!messages.length) return <p className="empty-state">No messages yet.</p>;
  return (
    <ol className="msg-thread" aria-label="Messages">
      {messages.map((m) => {
        const mine = viewer === "client" ? m.direction === "in" : m.direction !== "in";
        const tone = m.kind === "note" ? "note" : m.kind === "email" ? "email" : m.direction === "in" ? "client" : "broker";
        const who =
          m.kind === "note"
            ? `Internal note · ${m.author_name || "Staff"}`
            : m.kind === "email"
              ? "Email sent to you"
              : m.direction === "in"
                ? viewer === "client" ? "You" : m.author_name || "Client"
                : m.author_name || "Green Pacific";
        return (
          <li key={m.id} className={`msg-item ${mine ? "is-mine" : "is-theirs"} tone-${tone}`}>
            <div className="msg-meta">
              <span className="msg-who">{viewer === "staff" && m.kind === "email" ? "Email sent to the client" : who}</span>
              <time dateTime={m.created_at}>{fmtWhen(m.created_at)}</time>
              {m.channel === "email" && m.kind !== "email" && <span className="msg-via">by email</span>}
            </div>
            <div className="msg-bubble">
              {m.kind === "note" && <p className="msg-note-flag">Only staff can see this note.</p>}
              <div className="msg-body">{m.body}</div>
              {m.attachments.length > 0 && (
                <ul className="msg-files" aria-label="Attachments">
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={apiUrl(attachmentPath(a.id))} target="_blank" rel="noreferrer" download={a.filename}>
                        <span aria-hidden="true">📎</span> {a.filename}
                      </a>
                      <span className="msg-file-size">{fmtSize(a.size_bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {viewer === "staff" && m.email_status && <div className="msg-delivery">{m.email_status}</div>}
          </li>
        );
      })}
    </ol>
  );
}

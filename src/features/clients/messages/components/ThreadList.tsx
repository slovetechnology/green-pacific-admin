import { Link } from "react-router";
import { fmtListDate, type ThreadSummary } from "../messageTypes";

/** A list of conversations, newest first, each a link to the conversation. */
export function ThreadList({
  threads,
  linkTo,
  unreadOf,
  showClient = false,
  showStaffState = false,
  emptyMessage,
}: {
  threads: ThreadSummary[];
  linkTo: (t: ThreadSummary) => string;
  unreadOf: (t: ThreadSummary) => number;
  showClient?: boolean;
  showStaffState?: boolean;
  emptyMessage: string;
}) {
  if (!threads.length) return <p className="empty-state">{emptyMessage}</p>;
  return (
    <ul className="msg-list">
      {threads.map((t) => {
        const unread = unreadOf(t) > 0;
        return (
          <li key={t.id} className={unread ? "is-unread" : ""}>
            <Link to={linkTo(t)} className="msg-row">
              <span className="msg-dot" aria-hidden="true" />
              <span className="msg-row-main">
                <span className="msg-row-top">
                  {showClient && <span className="msg-row-client">{t.client_name}</span>}
                  <span className="msg-row-subject">
                    {unread && <span className="sr-text">Unread: </span>}
                    {t.subject}
                  </span>
                </span>
                <span className="msg-row-preview">{t.last_preview || " "}</span>
              </span>
              <span className="msg-row-side">
                <time dateTime={t.last_message_at}>{fmtListDate(t.last_message_at)}</time>
                <span className="msg-chips">
                  <span className="msg-chip">{t.topic}</span>
                  {showStaffState && t.status === "Open" && t.needs_reply ? <span className="msg-chip tone-warn">Awaiting reply</span> : null}
                  {t.status === "Closed" && <span className="msg-chip tone-muted">Closed</span>}
                  {showStaffState && t.category === "Complaint" && <span className="msg-chip tone-crit">Complaint</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

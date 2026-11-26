import { Link } from "react-router";
import { dealLink, tabForWhere, type GateItem } from "../lib/types";

// "This can't happen yet, and here is exactly why": the message from the server
// plus each missing item with a link to where it is fixed.
export function GateNotice({
  title,
  message,
  items,
  dealId,
  onDismiss,
  tone = "warn",
}: {
  title?: string;
  message?: string;
  items: GateItem[];
  dealId?: number;
  onDismiss?: () => void;
  tone?: "warn" | "crit";
}) {
  return (
    <div className={tone === "crit" ? "pl-notice is-crit" : "pl-notice"} role="alert">
      {title && <h3>{title}</h3>}
      {message && <p style={{ margin: 0 }}>{message}</p>}
      {items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.code}>
              {item.message}
              {dealId !== undefined && item.code !== "reason" && (
                <>
                  {" "}
                  <Link to={dealLink(dealId, tabForWhere(item.where))}>Fix this</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {(onDismiss || dealId !== undefined) && (
        <div className="pl-notice-actions">
          {dealId !== undefined && <Link to={dealLink(dealId)}>Open deal</Link>}
          {onDismiss && (
            <button type="button" className="btn-link" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

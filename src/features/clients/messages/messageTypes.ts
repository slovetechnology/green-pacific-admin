// Client Messages: one conversation (thread) per subject between a client and the broker.
// Shared by the staff app (Inbox > Client Messages) and the customer portal (Messages).

export interface MessageAttachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface ThreadMessage {
  id: number;
  /** message: written by someone; email: a copy of an email the system sent; note: staff only. */
  kind: "message" | "email" | "note";
  /** in: from the client; out: from the broker; internal: a staff note. */
  direction: "in" | "out" | "internal";
  body: string;
  /** The formatted version (cleaned HTML) when it was written in the staff editor; null for plain text. */
  body_html?: string | null;
  author_name: string | null;
  created_at: string;
  email_to?: string | null;
  email_status?: string | null;
  /** How it arrived: "portal", "email" (a reply to one of our emails), or null (written in the staff app). */
  channel?: string | null;
  attachments: MessageAttachment[];
}

export interface ThreadSummary {
  id: number;
  client_id?: number;
  client_name?: string;
  subject: string;
  topic: string;
  status: "Open" | "Closed";
  category?: string | null;
  started_by: "client" | "broker" | "system";
  needs_reply?: number;
  client_unread?: number;
  staff_unread?: number;
  assigned_user_id?: number | null;
  assigned_username?: string | null;
  last_message_at: string;
  last_preview: string | null;
  /** Portal only: how many messages each side wrote. */
  received?: number;
  sent?: number;
}

export interface ThreadDetail extends ThreadSummary {
  transaction_id: number | null;
  claim_id: number | null;
  policy: { id: number; policy_no: string | null; class_of_business: string | null } | null;
  claim: { id: number; claim_no: string } | null;
}

export interface AttachmentRules {
  extensions: string[];
  maxMb: number;
  maxFiles: number;
}

export interface LinkOptions {
  policies: { id: number; policy_no: string | null; class_of_business: string | null; end_date: string | null }[];
  claims: { id: number; claim_no: string; status: string }[];
}

export const DEFAULT_ATTACHMENT_RULES: AttachmentRules = {
  extensions: [".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx"],
  maxMb: 10,
  maxFiles: 5,
};

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Today 14:05", "Yesterday 09:12" or "3 Nov 2026, 16:40". Stored times are UTC. */
export function fmtWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const time = date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

/** A short date for list rows. */
export function fmtListDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

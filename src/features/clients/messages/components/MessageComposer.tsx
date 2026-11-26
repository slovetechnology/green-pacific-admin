import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@/shared/api/client";
import { DEFAULT_ATTACHMENT_RULES, fmtSize, type AttachmentRules } from "../messageTypes";

/**
 * The write box under a conversation (or the body of a new one). Builds a FormData with
 * `body` and `files`, plus `kind` and `email_to` for staff, and hands it to onSend.
 * `children` are extra fields placed above the message (subject, topic, client, ...).
 */
export function MessageComposer({
  onSend,
  staff = false,
  defaultEmailTo = "",
  emailSuggestions = [],
  rules = DEFAULT_ATTACHMENT_RULES,
  submitLabel = "Send",
  placeholder = "Write your message…",
  allowNote = false,
  children,
  extraFields,
}: {
  onSend: (form: FormData) => Promise<void>;
  staff?: boolean;
  defaultEmailTo?: string;
  emailSuggestions?: { name: string; email: string }[];
  rules?: AttachmentRules;
  submitLabel?: string;
  placeholder?: string;
  allowNote?: boolean;
  children?: ReactNode;
  /** Called while building the form, to add the caller's own fields. Return an error to stop. */
  extraFields?: (form: FormData) => string | null;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<"message" | "note">("message");
  const [emailTo, setEmailTo] = useState(defaultEmailTo);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isNote = kind === "note";

  function addFiles(list: FileList | null) {
    setError(null);
    const picked = Array.from(list ?? []);
    const next = [...files, ...picked];
    if (next.length > rules.maxFiles) {
      setError(`Attach at most ${rules.maxFiles} files to one message.`);
      return;
    }
    for (const f of picked) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!rules.extensions.includes(ext)) {
        setError(`"${f.name}" can't be attached. Attach PDF, JPG, PNG, Word (.docx) or Excel (.xlsx) files.`);
        return;
      }
      if (f.size > rules.maxMb * 1024 * 1024) {
        setError(`"${f.name}" is ${fmtSize(f.size)}; each attachment can be up to ${rules.maxMb} MB.`);
        return;
      }
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError(isNote ? "Please write the note." : "Please write your message.");
      return;
    }
    const form = new FormData();
    const extraError = extraFields?.(form) ?? null;
    if (extraError) {
      setError(extraError);
      return;
    }
    form.append("body", body);
    if (staff) {
      form.append("kind", kind);
      if (!isNote) form.append("email_to", emailTo);
    }
    for (const f of files) form.append("files", f, f.name);
    setSending(true);
    try {
      await onSend(form);
      setBody("");
      setFiles([]);
      setKind("message");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={`msg-composer${isNote ? " is-note" : ""}`} onSubmit={handleSubmit}>
      {allowNote && (
        <div className="msg-mode" role="radiogroup" aria-label="What to write">
          <label className={!isNote ? "active" : ""}>
            <input type="radio" name="msg-kind" checked={!isNote} onChange={() => setKind("message")} /> Reply to client
          </label>
          <label className={isNote ? "active" : ""}>
            <input type="radio" name="msg-kind" checked={isNote} onChange={() => setKind("note")} /> Internal note
          </label>
        </div>
      )}
      {children}
      <div className="field">
        <label htmlFor="msg-body">{isNote ? "Note (only staff will see this)" : "Message"}</label>
        <textarea id="msg-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={isNote ? "Write a note for colleagues…" : placeholder} />
      </div>
      {staff && !isNote && (
        <div className="field">
          <label htmlFor="msg-email-to">Email a copy to</label>
          <input id="msg-email-to" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} list="msg-email-suggestions" placeholder="client@example.com" />
          <datalist id="msg-email-suggestions">
            {emailSuggestions.map((s) => (
              <option key={s.email} value={s.email}>{s.name}</option>
            ))}
          </datalist>
          <small className="msg-help">The message is always saved to the client's portal. Leave this blank to save it without emailing.</small>
        </div>
      )}
      <div className="msg-attach">
        <label className="btn-secondary btn btn-sm msg-attach-btn">
          Attach files
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={rules.extensions.join(",")}
            onChange={(e) => addFiles(e.target.files)}
            className="msg-file-input"
          />
        </label>
        <small className="msg-help">PDF, JPG, PNG, Word or Excel · up to {rules.maxFiles} files, {rules.maxMb} MB each</small>
        {files.length > 0 && (
          <ul className="msg-picked">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {f.name} <span className="msg-file-size">{fmtSize(f.size)}</span>
                <button type="button" className="msg-remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div className="flash flash-error" role="alert">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn" disabled={sending}>
          {sending ? "Sending…" : isNote ? "Save note" : submitLabel}
        </button>
      </div>
    </form>
  );
}

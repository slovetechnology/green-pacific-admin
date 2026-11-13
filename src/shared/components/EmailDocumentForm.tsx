import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface EmailOptions {
  configured: boolean;
  suggestions: { name: string; email: string }[];
}

interface Props {
  /** Heading, e.g. "Email Receipt". */
  title: string;
  /** What is attached, e.g. "receipt" -> "The receipt PDF is attached automatically." */
  documentLabel: string;
  clientName: string;
  /** GET endpoint answering { configured, suggestions }. */
  optionsUrl: string;
  /** POST endpoint taking { to, message } and answering { message }. */
  sendUrl: string;
  onSent: (message: string) => void;
  onClose: () => void;
}

// The "email this PDF to the client" form shared by receipts and renewal notices.
export function EmailDocumentForm({ title, documentLabel, clientName, optionsUrl, sendUrl, onSent, onClose }: Props) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({ queryKey: ["email-options", optionsUrl], queryFn: () => api.get<EmailOptions>(optionsUrl) });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ sent: boolean; message: string }>(sendUrl, { to, message: note });
      onSent(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not email the ${documentLabel}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>{title}</h2>
      {error && <div className="flash flash-error">{error}</div>}
      {options.data && !options.data.configured && (
        <div className="flash flash-error">
          Email isn't set up on the server (RESEND_API_KEY on Render). Download the PDF and send it manually.
        </div>
      )}
      <label>
        Send to
        <input
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@example.com (separate several with commas)"
          required
          autoFocus
        />
      </label>
      {!!options.data?.suggestions.length && (
        <p className="text-muted">
          On file for {clientName}:{" "}
          {options.data.suggestions.map((s, i) => (
            <span key={s.email}>
              {i > 0 && ", "}
              <button type="button" className="btn-link" onClick={() => setTo(s.email)}>
                {s.name ? `${s.name} <${s.email}>` : s.email}
              </button>
            </span>
          ))}
        </p>
      )}
      <label>
        Message (optional)
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="text-muted">The {documentLabel} PDF is attached automatically.</p>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy || options.data?.configured === false}>
          {busy ? "Sending…" : "Send"}
        </button>
        <button type="button" className="btn-secondary btn" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}

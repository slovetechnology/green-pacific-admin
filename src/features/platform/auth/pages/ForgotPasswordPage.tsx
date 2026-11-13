import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/shared/api/client";
import { AuthAlert, AuthField, AuthFrame, AuthHeading, AuthResult, SecureNote } from "../components/AuthFrame";

// Shown by SignInScreen. The server answers the same way whether or not the address has an account, so
// the confirmation never says whether one exists.
export function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/forgot-password", { identifier });
      setSentTo(identifier.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo !== null) {
    return (
      <AuthFrame>
        <AuthResult
          icon="send"
          title="Check your inbox"
          actions={
            <>
              <button type="button" className="si-submit" onClick={onBack}>Back to sign in</button>
              <button type="button" className="si-secondary" onClick={() => setSentTo(null)}>Use a different email</button>
            </>
          }
        >
          <p>
            If <strong>{sentTo || "that address"}</strong> belongs to a staff account, a link to choose a new password is on its
            way.
          </p>
          <ul className="si-steps">
            <li>The link works once and expires in one hour.</li>
            <li>Nothing there after a few minutes? Check your spam or junk folder.</li>
            <li>Still nothing? Your administrator can set a new password for you.</li>
          </ul>
        </AuthResult>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthHeading title="Reset your password" onBack={onBack}>
        Enter the work email you sign in with and we'll send you a secure link to choose a new password.
      </AuthHeading>
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <form className="si-form" onSubmit={handleSubmit} noValidate>
        <AuthField id="identifier" label="Work email" icon="mail" type="email" value={identifier} onChange={setIdentifier} autoComplete="username" autoFocus placeholder="name@greenpacificng.com" />
        <button type="submit" className="si-submit" disabled={submitting}>
          {submitting ? <><span className="si-spinner" aria-hidden="true" /> Sending link…</> : "Send reset link"}
        </button>
      </form>
      <SecureNote>For your security we never say whether an email address has an account.</SecureNote>
    </AuthFrame>
  );
}

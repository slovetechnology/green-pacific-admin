import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/shared/api/client";
import { AuthAlert, AuthField, AuthFrame, AuthHeading, AuthResult, SecureNote } from "../components/AuthFrame";

// Opened from the emailed link (/?reset_token=...), shown by SignInScreen. The server checks the link and
// the new password; its answer is what the page shows.
export function ResetPasswordPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/reset-password", { token, password, confirm });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthFrame>
        <AuthResult icon="check" title="Password updated" actions={<button type="button" className="si-submit" onClick={onBack}>Continue to sign in</button>}>
          <p>Your new password is ready to use. For your security you have been signed out on every device.</p>
        </AuthResult>
      </AuthFrame>
    );
  }

  if (!token) {
    return (
      <AuthFrame>
        <AuthResult icon="alert" title="This link is incomplete" actions={<button type="button" className="si-submit" onClick={onBack}>Back to sign in</button>}>
          <p>Open the link from the email again, or request a new one with "Forgot password?" on the sign-in screen.</p>
        </AuthResult>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthHeading title="Choose a new password" onBack={onBack}>
        Pick a password you haven't used here before. A long phrase is easier to remember and harder to guess.
      </AuthHeading>
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <form className="si-form" onSubmit={handleSubmit} noValidate>
        <AuthField id="new-password" label="New password" icon="key" type="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <AuthField id="confirm-password" label="Confirm new password" icon="lock" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button type="submit" className="si-submit" disabled={submitting}>
          {submitting ? <><span className="si-spinner" aria-hidden="true" /> Saving…</> : "Update password"}
        </button>
      </form>
      <SecureNote>Changing your password signs you out on every device.</SecureNote>
    </AuthFrame>
  );
}

import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { ApiError } from "@/shared/api/client";
import { AuthAlert, AuthField, AuthFrame, AuthHeading, SecureNote } from "../components/AuthFrame";

// Shown by SignInScreen. The server decides everything: what it refuses comes back as the message shown.
export function LoginPage({ onForgot }: { onForgot: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Once the session is confirmed, the page that was asked for replaces this screen.
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <AuthHeading eyebrow="Staff portal" title="Welcome back">
        Sign in with your work email to continue.
      </AuthHeading>
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <form className="si-form" onSubmit={handleSubmit} noValidate>
        <AuthField id="email" label="Work email" icon="mail" type="email" value={email} onChange={setEmail} autoComplete="username" autoFocus placeholder="name@greenpacificng.com" />
        <AuthField
          id="password"
          label="Password"
          icon="lock"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          aside={<button type="button" className="si-link" onClick={onForgot}>Forgot password?</button>}
        />
        <button type="submit" className="si-submit" disabled={submitting}>
          {submitting ? <><span className="si-spinner" aria-hidden="true" /> Signing in…</> : "Sign in"}
        </button>
      </form>
      <SecureNote>For authorised Green Pacific staff only. Sign-ins and changes are recorded.</SecureNote>
    </AuthFrame>
  );
}

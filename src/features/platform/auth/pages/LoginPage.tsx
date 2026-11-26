import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { api, ApiError } from "@/shared/api/client";
import { AuthAlert, AuthField, AuthFrame, AuthHeading, SecureNote } from "../components/AuthFrame";
import { CodeForm, RecoveryCodes, SetupPanel } from "../components/TwoFactor";

// Shown by SignInScreen. The server decides everything: what it refuses comes back as the message shown.
export function LoginPage({ onForgot }: { onForgot: () => void }) {
  const { login, finishSignIn } = useAuth();
  // After a right password: "verify" asks for the two-factor code, "setup" sets it up (required for this
  // person and not yet done), then "codes" shows the recovery codes once before going in.
  const [step, setStep] = useState<"password" | "verify" | "setup" | "codes">("password");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
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
      const next = await login(email, password);
      if (next !== "done") {
        setPassword("");
        setStep(next);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const backToPassword = () => { setStep("password"); setError(null); };

  if (step === "verify") {
    return (
      <AuthFrame>
        <AuthHeading eyebrow="Two-factor sign-in" title="Enter your code" onBack={backToPassword}>
          Open your authenticator app and type the 6-digit code for Green Pacific ERP. Lost your phone? Use one of your recovery codes.
        </AuthHeading>
        <CodeForm
          variant="signin"
          allowRecovery
          submitLabel="Verify and sign in"
          busyLabel="Checking…"
          onSubmit={async (code) => {
            await api.post("/api/auth/login/mfa", { code });
            await finishSignIn();
          }}
        />
        <SecureNote>Codes change every 30 seconds. If yours is refused, wait for the next one.</SecureNote>
      </AuthFrame>
    );
  }

  if (step === "setup") {
    return (
      <AuthFrame>
        <AuthHeading eyebrow="Two-factor sign-in" title="Set up two-factor sign-in" onBack={backToPassword}>
          Your account must use a code from your phone as well as your password. This takes about a minute.
        </AuthHeading>
        <SetupPanel
          variant="signin"
          startUrl="/api/auth/login/mfa/setup"
          confirmUrl="/api/auth/login/mfa/confirm"
          onDone={(codes) => { setRecoveryCodes(codes); setStep("codes"); }}
        />
      </AuthFrame>
    );
  }

  if (step === "codes") {
    return (
      <AuthFrame>
        <AuthHeading eyebrow="Two-factor sign-in is on" title="Save your recovery codes" />
        <RecoveryCodes codes={recoveryCodes} />
        {error && <AuthAlert tone="error">{error}</AuthAlert>}
        <button
          type="button"
          className="si-submit"
          onClick={() => { finishSignIn().catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't reach the server.")); }}
        >
          I've saved them, continue
        </button>
      </AuthFrame>
    );
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

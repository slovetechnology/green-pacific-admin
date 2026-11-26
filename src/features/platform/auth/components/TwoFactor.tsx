import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/shared/api/client";
import "./twofactor.css";

// Two-factor sign-in pieces shared by the sign-in screen (si-* look) and the Account page (card look).
// The server checks every code; these only collect them.

export interface MfaSetupStart {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "We couldn't reach the server. Check your connection and try again.";

/** A box for a 6-digit code (or a recovery code) and a submit button. */
export function CodeForm({ onSubmit, submitLabel, busyLabel, variant, allowRecovery = false, autoFocus = true }: {
  onSubmit: (code: string) => Promise<void>;
  submitLabel: string;
  busyLabel: string;
  variant: "signin" | "card";
  allowRecovery?: boolean;
  autoFocus?: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(code);
    } catch (err) {
      setError(errorText(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const label = allowRecovery ? "6-digit code, or a recovery code" : "6-digit code from your app";
  const input = (
    <input
      id="mfa_code"
      value={code}
      onChange={(e) => setCode(e.target.value)}
      inputMode={allowRecovery ? "text" : "numeric"}
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      maxLength={allowRecovery ? 12 : 7}
      spellCheck={false}
      placeholder={allowRecovery ? "123456 or ABCD-EFGH" : "123456"}
    />
  );

  if (variant === "signin") {
    return (
      <form className="si-form" onSubmit={handle} noValidate>
        {error && <div className="si-alert si-alert-error" role="alert"><span>{error}</span></div>}
        <div className="si-field">
          <div className="si-label-row"><label htmlFor="mfa_code">{label}</label></div>
          <div className="si-input si-input-code">{input}</div>
        </div>
        <button type="submit" className="si-submit" disabled={busy || !code.trim()}>
          {busy ? <><span className="si-spinner" aria-hidden="true" /> {busyLabel}</> : submitLabel}
        </button>
      </form>
    );
  }
  return (
    <form onSubmit={handle} noValidate>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="mfa_code">{label}</label>
          {input}
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy || !code.trim()}>{busy ? busyLabel : submitLabel}</button>
      </div>
    </form>
  );
}

/** Starts setup (startUrl), shows the QR code and the key, and confirms with the first code (confirmUrl). */
export function SetupPanel({ startUrl, confirmUrl, variant, onDone }: {
  startUrl: string;
  confirmUrl: string;
  variant: "signin" | "card";
  onDone: (recoveryCodes: string[]) => void;
}) {
  const [start, setStart] = useState<MfaSetupStart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.post<MfaSetupStart>(startUrl)
      .then((s) => { if (live) setStart(s); })
      .catch((err) => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, [startUrl]);

  if (error) return <div className={variant === "signin" ? "si-alert si-alert-error" : "flash flash-error"} role="alert">{error}</div>;
  if (!start) return <p className={variant === "signin" ? "si-sub" : "text-muted"}>Preparing your QR code…</p>;

  return (
    <div className={`mfa-setup mfa-setup-${variant}`}>
      <ol className="mfa-steps">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy or similar).</li>
        <li>Add an account and scan this QR code.</li>
      </ol>
      <div className="mfa-qr">
        <img src={start.qrDataUrl} alt="QR code to scan with your authenticator app" width={180} height={180} />
      </div>
      <p className="mfa-key">
        Can't scan it? Enter this key instead:
        <code>{start.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
      </p>
      <ol className="mfa-steps" start={3}>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <CodeForm
        variant={variant}
        submitLabel="Turn on two-factor sign-in"
        busyLabel="Checking…"
        autoFocus={false}
        onSubmit={async (code) => {
          const res = await api.post<{ recoveryCodes: string[] }>(confirmUrl, { code });
          onDone(res.recoveryCodes);
        }}
      />
    </div>
  );
}

/** The one-time recovery codes, shown once, with copy and download. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  function download() {
    const blob = new Blob([`Green Pacific ERP recovery codes\nEach code works once. Keep them somewhere safe.\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "green-pacific-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mfa-codes">
      <p>
        If you lose your phone, each of these codes signs you in once instead of an app code.
        Save them now: they won't be shown again.
      </p>
      <ul className="mfa-code-list">
        {codes.map((c) => <li key={c}><code>{c}</code></li>)}
      </ul>
      <div className="mfa-code-actions">
        <button type="button" className="btn btn-secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)); }}>
          {copied ? "Copied" : "Copy codes"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={download}>Download as text</button>
      </div>
    </div>
  );
}

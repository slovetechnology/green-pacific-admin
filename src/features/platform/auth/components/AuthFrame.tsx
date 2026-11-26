import { useState, type ReactNode } from "react";
import { COMPANY } from "@/shared/lib/company";
import "../signin.css";

// The frame every signed-out view sits in (sign in, forgot password, reset password): the brand panel on
// the left (hidden on small screens) and the form on the right. Always light: dark mode is applied only
// once someone is signed in (useSignedInTheme in the app shell).
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="si-page">
      <aside className="si-brand" aria-hidden="true">
        <div className="si-brand-top">
          <span className="si-brand-logo"><img src="/logo.png" alt="" /></span>
        </div>
        <div className="si-brand-body">
          <p className="si-brand-eyebrow">Staff workspace</p>
          <h2 className="si-brand-title">Placing, servicing and protecting our clients' risks.</h2>
          <ul className="si-brand-points">
            <li>
              <span className="si-point-icon"><Icon name="file" /></span>
              <span><strong>Placement &amp; policies</strong>Slips, quotes, debit notes and policy documents.</span>
            </li>
            <li>
              <span className="si-point-icon"><Icon name="umbrella" /></span>
              <span><strong>Claims advocacy</strong>Every claim tracked from notification to settlement.</span>
            </li>
            <li>
              <span className="si-point-icon"><Icon name="calendar" /></span>
              <span><strong>Renewals &amp; compliance</strong>Expiries, NAICOM caps and KYC kept in view.</span>
            </li>
          </ul>
        </div>
        <p className="si-brand-foot">© {new Date().getFullYear()} {COMPANY.name}</p>
      </aside>

      <main className="si-main">
        <div className="si-panel">
          <img className="si-mobile-logo" src="/logo.png" alt={COMPANY.name} />
          {children}
        </div>
        <footer className="si-contact">
          <span>{COMPANY.address}</span>
          <span>
            {COMPANY.mobiles.map((m) => (
              <span key={m}>
                <a href={`tel:${m}`}>{m}</a>
                <span aria-hidden="true"> · </span>
              </span>
            ))}
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </span>
        </footer>
      </main>
    </div>
  );
}

/** The heading block of a view: an optional back link, the title and a line under it. */
export function AuthHeading({ eyebrow, title, children, onBack, backLabel = "Back to sign in" }: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className="si-head">
      {onBack && (
        <button type="button" className="si-back" onClick={onBack}>
          <Icon name="arrow-left" /> {backLabel}
        </button>
      )}
      {eyebrow && <p className="si-eyebrow">{eyebrow}</p>}
      <h1 className="si-title">{title}</h1>
      {children && <p className="si-sub">{children}</p>}
    </header>
  );
}

/** An input with a leading icon; password inputs get a show/hide button. */
export function AuthField({ id, label, icon, type = "text", value, onChange, autoComplete, autoFocus, aside, placeholder }: {
  id: string;
  label: string;
  icon: IconName;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  aside?: ReactNode;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="si-field">
      <div className="si-label-row">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="si-input">
        <span className="si-input-icon"><Icon name={icon} /></span>
        <input
          id={id}
          type={isPassword && shown ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          spellCheck={false}
        />
        {isPassword && (
          <button type="button" className="si-reveal" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
            <Icon name={shown ? "eye-off" : "eye"} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div className={`si-alert si-alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" ? "alert" : "info"} />
      <span>{children}</span>
    </div>
  );
}

/** A finished step (link sent, password changed): a large icon, a title and what to do next. */
export function AuthResult({ icon, title, children, actions }: { icon: IconName; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="si-result">
      <span className="si-result-icon"><Icon name={icon} /></span>
      <h1 className="si-title">{title}</h1>
      <div className="si-sub">{children}</div>
      <div className="si-actions">{actions}</div>
    </div>
  );
}

export function SecureNote({ children }: { children: ReactNode }) {
  return (
    <p className="si-secure">
      <Icon name="shield" />
      <span>{children}</span>
    </p>
  );
}

type IconName = "mail" | "lock" | "eye" | "eye-off" | "arrow-left" | "shield" | "alert" | "info" | "check" | "send" | "file" | "umbrella" | "calendar" | "key";

const PATHS: Record<IconName, ReactNode> = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M16 7l2 2M14 9l2 2" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
  "arrow-left": <path d="M19 12H5m6-6-6 6 6 6" />,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  send: <><path d="M3 11.5 21 4l-7.5 18-2.5-8-8-2.5Z" /><path d="m11 14 10-10" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  umbrella: <><path d="M3 12a9 9 0 0 1 18 0H3Z" /><path d="M12 12v6a2 2 0 0 0 4 0M12 3v0" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4m8-4v4m-8 7 2 2 4-4" /></>,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="si-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

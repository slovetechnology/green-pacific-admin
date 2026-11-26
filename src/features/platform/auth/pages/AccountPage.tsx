import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "../AuthContext";
import { CodeForm, RecoveryCodes, SetupPanel } from "../components/TwoFactor";

interface MfaStatus {
  enabled: boolean;
  required: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

// Two-factor sign-in for the signed-in person: set it up, make new recovery codes, or turn it off (not when an
// admin requires it). Every step is checked by the server (auth/mfa.js).
function TwoFactorCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["auth", "mfa"], queryFn: () => api.get<MfaStatus>("/api/auth/mfa") });
  const [mode, setMode] = useState<"idle" | "setup" | "codes" | "regenerate" | "disable">("idle");
  const [codes, setCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = () => queryClient.invalidateQueries({ queryKey: ["auth", "mfa"] });

  function showCodes(next: string[]) {
    setCodes(next);
    setMode("codes");
    void reload();
  }

  return (
    <div className="card">
      <h2>Two-factor sign-in</h2>
      {notice && <div className="flash flash-success">{notice}</div>}
      {isLoading || !data ? (
        <p className="text-muted">Loading…</p>
      ) : mode === "setup" ? (
        <>
          <SetupPanel variant="card" startUrl="/api/auth/mfa/setup" confirmUrl="/api/auth/mfa/confirm" onDone={(c) => { setNotice("Two-factor sign-in is on."); showCodes(c); }} />
          <button type="button" className="btn btn-secondary" onClick={() => setMode("idle")}>Cancel</button>
        </>
      ) : mode === "codes" ? (
        <>
          <RecoveryCodes codes={codes} />
          <div className="form-actions"><button type="button" className="btn" onClick={() => setMode("idle")}>Done</button></div>
        </>
      ) : mode === "regenerate" ? (
        <>
          <p>Enter a code from your app to make 10 new recovery codes. The old ones stop working.</p>
          <CodeForm variant="card" submitLabel="Make new codes" busyLabel="Checking…" onSubmit={async (code) => {
            const res = await api.post<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes", { code });
            setNotice("New recovery codes made.");
            showCodes(res.recoveryCodes);
          }} />
          <button type="button" className="btn btn-secondary" onClick={() => setMode("idle")}>Cancel</button>
        </>
      ) : mode === "disable" ? (
        <>
          <p>Enter a code from your app (or a recovery code) to turn two-factor sign-in off.</p>
          <CodeForm variant="card" allowRecovery submitLabel="Turn off" busyLabel="Checking…" onSubmit={async (code) => {
            await api.post("/api/auth/mfa/disable", { code });
            setNotice("Two-factor sign-in is off.");
            setMode("idle");
            void reload();
          }} />
          <button type="button" className="btn btn-secondary" onClick={() => setMode("idle")}>Cancel</button>
        </>
      ) : data.enabled ? (
        <>
          <p>
            <span className="badge badge-paid">On</span>{" "}
            Signing in asks for a code from your authenticator app. {data.recoveryCodesLeft} recovery code{data.recoveryCodesLeft === 1 ? "" : "s"} left.
          </p>
          {data.required && <p className="text-muted">Your administrator requires two-factor sign-in for your account.</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setNotice(null); setMode("regenerate"); }}>New recovery codes</button>
            {!data.required && <button type="button" className="btn btn-secondary" onClick={() => { setNotice(null); setMode("disable"); }}>Turn off</button>}
          </div>
        </>
      ) : (
        <>
          <p>
            <span className="badge badge-secondary">Off</span>{" "}
            Add a code from your phone to your password, so a stolen password alone can't open your account.
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => { setNotice(null); setMode("setup"); }}>Set up two-factor sign-in</button>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileCard() {
  const { user, refresh } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.post("/api/auth/account/profile", { first_name: firstName, last_name: lastName });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Your name</h2>
      {saved && <div className="flash flash-success">Name updated.</div>}
      {error && <div className="flash flash-error">{error}</div>}
      <form onSubmit={handleSave}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="first_name">First name</label>
            <input id="first_name" value={firstName} maxLength={100} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" value={lastName} maxLength={100} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="account_email">Email (sign-in)</label>
            <input id="account_email" type="email" value={user?.email ?? ""} readOnly disabled />
            <small>Ask an administrator to change it.</small>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);


    setSubmitting(true);
    try {
      await api.post("/api/auth/account/password", { currentPassword, newPassword, confirm: confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>{user?.name}</h1>
          {user?.email && <p className="text-muted">{user.email}</p>}
        </div>
      </div>

      <ProfileCard key={`${user?.firstName}|${user?.lastName}`} />

      <TwoFactorCard />

      <div className="card">
        <h2>Change Password</h2>
        {success && <div className="flash flash-success">Password updated.</div>}
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="current_password">Current password</label>
              <input
                id="current_password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new_password">New password</label>
              <input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm_password">Confirm new password</label>
              <input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

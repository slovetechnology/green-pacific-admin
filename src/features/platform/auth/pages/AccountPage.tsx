import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "../AuthContext";

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

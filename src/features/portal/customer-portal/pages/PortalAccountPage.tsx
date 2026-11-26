import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiError } from "@/shared/api/client";
import { usePortalAuth } from "../PortalAuthContext";

export function PortalAccountPage() {
  const { customer, refresh } = usePortalAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/portal/account/password", { currentPassword, newPassword, confirmPassword });
      await refresh();
      navigate("/portal");
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
          <p className="eyebrow">Customer Portal</p>
          <h1>Account</h1>
        </div>
      </div>

      <div className="card">
        <div className="detail-grid">
          <div>
            <div className="k">Name</div>
            <div className="v">{customer?.name}</div>
          </div>
          <div>
            <div className="k">Email</div>
            <div className="v">{customer?.email}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Insurance resources</div>
        <p className="period-note">Explore available covers, compare indicative premiums, and find answers to common insurance questions.</p>
        <div className="detail-grid">
          <div>
            <div className="k">Marketplace</div>
            <div className="v"><Link to="/portal/marketplace">Browse insurance covers and benefits</Link></div>
          </div>
          <div>
            <div className="k">Quotes</div>
            <div className="v"><Link to="/portal/quotes">Request a quote, with an instant premium estimate</Link></div>
          </div>
          <div>
            <div className="k">Insurance FAQ</div>
            <div className="v"><Link to="/portal/faq">Read cover explanations and common questions</Link></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Change Password</h2>
        {customer?.mustChangePassword && (
          <div className="flash flash-error">Please set a new password to continue.</div>
        )}
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

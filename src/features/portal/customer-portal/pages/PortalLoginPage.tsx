import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { usePortalAuth } from "../PortalAuthContext";
import { ApiError } from "@/shared/api/client";
import "@/shared/styles/portal-tailwind.css";
import "@/shared/styles/portal-theme.css";

export function PortalLoginPage() {
  const { customer, login } = usePortalAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The email and password belong to a staff login (an agent, say), which signs in at "/", not here.
  const [staffAccount, setStaffAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Also fires right after a successful login (login() updates the same
  // query cache handleSubmit reads), racing with handleSubmit's own
  // navigate() call below — so it must agree on the same destination
  // logic rather than always redirecting to the dashboard.
  if (customer) {
    const dest = customer.mustChangePassword ? "/portal/account" : searchParams.get("next") || "/portal";
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStaffAccount(false);
    setSubmitting(true);
    try {
      const cu = await login(email, password);
      if (cu.mustChangePassword) {
        navigate("/portal/account");
      } else {
        navigate(searchParams.get("next") || "/portal");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStaffAccount(err instanceof ApiError && err.data?.staffAccount === true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="customer-portal">
      <div className="cp-login">
        <div className="cp-login-art">
          <div className="cp-brand cp-entry-brand">Green Pacific Insurance Brokers Ltd</div>
          <div>
            <h2>Every policy you hold, in one place.</h2>
            <p>
              Check what you&rsquo;re covered for, renew before it lapses, and notify a claim
              without waiting for office hours.
            </p>
          </div>
          <div className="cp-entry-footnote">Licensed insurance broker</div>
        </div>
        <div className="cp-login-form">
          <div className="cp-formbox">
            <h3>Sign in to your account</h3>
            <p className="cp-lead">Use the email address on your policy schedule.</p>
            {error && (
              <div className="flash flash-error">
                {error}
                {staffAccount && (
                  <>
                    {" "}
                    <Link to="/">Go to the staff sign-in</Link>
                  </>
                )}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="cp-btn" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="cp-hint">
              New here? Your account is created when your first policy is issued. If you haven&rsquo;t
              received an invite, ask your account officer to resend it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

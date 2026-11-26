import { Link } from "react-router";
import "@/shared/styles/portal-tailwind.css";
import "@/shared/styles/portal-theme.css";

/**
 * Public marketing splash for the customer portal — the page a link on the
 * broker's (currently under-construction) website points at. No auth, no
 * API calls: pure entry point into /portal/login.
 */
export function PortalLandingPage() {
  return (
    <div className="customer-portal">
      <div className="cp-login">
        <div className="cp-login-art">
          <div className="cp-brand cp-entry-brand">Green Pacific Insurance Brokers Ltd</div>
          <div>
            <h2>Your policies, claims and payments — always within reach.</h2>
            <p>
              The client portal gives you a single place to see what you&rsquo;re covered for, renew
              before a policy lapses, notify a claim, and download your certificates — any time,
              without waiting on office hours.
            </p>
          </div>
          <ul className="cp-entry-list">
            <li>See every policy on one cover timeline</li>
            <li>Pay outstanding premiums online</li>
            <li>Notify and track a claim from your phone</li>
            <li>Download certificates and schedules anytime</li>
          </ul>
        </div>
        <div className="cp-login-form">
          <div className="cp-formbox">
            <h3>Client portal</h3>
            <p className="cp-lead">
              Already a Green Pacific client? Sign in to manage your cover.
            </p>
            <Link to="/portal/login" className="cp-btn cp-entry-cta">
              Sign in to your account
            </Link>
            <p className="cp-hint">
              New here? Your portal account is created automatically the first time your broker
              places a policy for you — check your email for an invite, or ask your account officer
              to send one.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import "../signin.css";

// Shown while the server answers "who is signed in?" (GET /api/auth/me). On a host that is waking up this
// can take a few seconds, so the page says so instead of staying blank.
export function SessionCheck() {
  return (
    <div className="si-page si-page--loading" role="status" aria-live="polite">
      <div className="si-loading">
        <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" />
        <span className="si-loading-bar" aria-hidden="true"><span /></span>
        <p>Connecting securely…</p>
      </div>
    </div>
  );
}

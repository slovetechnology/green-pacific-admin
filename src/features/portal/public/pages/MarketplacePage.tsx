import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { CompanyContact } from "@/shared/components/CompanyContact";
import { FieldInput, type Answers, type Field, type FormMeta } from "../components/RequestQuoteForm";
import { PremiumEstimate } from "../components/PremiumEstimate";
import { ESTIMATE_FIELDS, estimateFieldShown, estimatePremium } from "../lib/premiumEstimate";

interface FaqClass {
  name: string;
  summary: string;
  scope: string[];
  benefits: string[];
  exceptions: string[];
  extensions: string[];
  other: string[];
}
interface FaqCategory {
  name: string;
  classes: FaqClass[];
}
interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}
interface MarketplaceResponse {
  guest: Guest | null;
  categories: FaqCategory[];
  categoryIcons: Record<string, string>;
  nClasses: number;
}

// Where the catalogue's links go. The public website, the staff app and the customer portal each keep
// the visitor inside their own shell: "Get a quote" opens that shell's Request for Quote form.
export interface MarketplaceLinks {
  quote: (params: URLSearchParams) => string;
  faq: string;
}
const PUBLIC_LINKS: MarketplaceLinks = {
  quote: (params) => `/marketplace/quote?${params}`,
  faq: "/marketplace/faq",
};

// ---------- Premium estimator ----------
// One short estimator for every class, using the same questions and rates as the Request for Quote
// form (lib/premiumEstimate.ts), so "Get an exact quote" carries the answers straight into the form.
function PremiumEstimator({ meta, className, onClassChange, links }: { meta: FormMeta | undefined; className: string; onClassChange: (name: string) => void; links: MarketplaceLinks }) {
  const [answers, setAnswers] = useState<Answers>({});
  const classes = useMemo(() => meta?.categories.flatMap((c) => c.classes) ?? [], [meta]);
  const formId = classes.find((c) => c.name === className)?.form;
  const form = meta?.forms.find((f) => f.id === formId);
  const fields = (ESTIMATE_FIELDS[formId ?? ""] ?? [])
    .map((key) => form?.fields.find((f) => f.key === key))
    .filter((f): f is Field => !!f && estimateFieldShown(f.key, answers, className))
    .map((f) => ({ ...f, required: false }));

  const params = new URLSearchParams({ class: className });
  if (formId === "motor") params.set("cover_type", className.includes("Third Party") ? "Third Party Only" : "Comprehensive");
  for (const f of fields) {
    const v = answers[f.key];
    if (typeof v === "string" && v.trim()) params.set(f.key, v.trim());
  }

  return (
    <section className="mkt-section" id="estimate">
      <div className="mkt-section-head">
        <div>
          <h2>Estimate your premium</h2>
          <p>Pick a cover and answer one or two questions for a rough yearly price. Then ask for an exact quote: we send it within 24 hours.</p>
        </div>
      </div>
      <div className="card estimator">
        {!meta ? (
          <p>Loading…</p>
        ) : (
          <div className="estimator-grid">
            <div className="form-grid estimator-inputs">
              <div className="field span-3">
                <label htmlFor="est-class">Type of insurance</label>
                <select id="est-class" value={className} onChange={(e) => onClassChange(e.target.value)}>
                  <option value="">Choose a cover…</option>
                  {meta.categories.map((cat) => (
                    <optgroup key={cat.name} label={cat.name}>
                      {cat.classes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              {fields.map((f) => (
                <FieldInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
              ))}
            </div>
            <div className="estimator-result">
              {className ? (
                <>
                  <PremiumEstimate className={className} formId={formId} answers={answers} />
                  <Link className="btn" to={links.quote(params)}>Get an exact quote →</Link>
                </>
              ) : (
                <p className="estimate-basis">Choose the type of insurance to see an estimate.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- The catalogue: quick access, every class, the estimator and the FAQ teaser ----------
// Shared by the public website (inside its own nav and hero) and the in-app pages for staff and
// customers (MarketplaceInApp), so all three show the same covers and the same estimate.
function MarketplaceCatalogue({ links, search }: { links: MarketplaceLinks; search: string }) {
  const location = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace"],
    queryFn: () => api.get<MarketplaceResponse>("/api/marketplace"),
  });
  const quoteMeta = useQuery({ queryKey: ["rfq-form"], queryFn: () => api.get<FormMeta>("/api/marketplace/quote/form") });
  const [estimateClass, setEstimateClass] = useState("");
  const estimable = useMemo(() => {
    const ids = new Map((quoteMeta.data?.categories ?? []).flatMap((c) => c.classes).map((c) => [c.name, c.form]));
    // Only classes with a figure to show: health, travel and savings plans are priced individually.
    return (name: string) => {
      const result = ids.has(name) ? estimatePremium(name, ids.get(name), {}) : null;
      return !!result && result.kind !== "none";
    };
  }, [quoteMeta.data]);

  function estimateFor(name: string) {
    setEstimateClass(name);
    document.getElementById("estimate")?.scrollIntoView({ behavior: "smooth" });
  }

  // React Router doesn't auto-scroll to a #hash on navigation (unlike a
  // real page load) — nudge it once data's in so anchors from the FAQ
  // page's "Insurance Types"/"Calculator" nav links land correctly.
  useEffect(() => {
    if (!location.hash || isLoading) return;
    const el = document.querySelector(location.hash);
    el?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash, isLoading]);

  const categories = data?.categories ?? [];
  const categoryIcons = data?.categoryIcons ?? {};
  const q = search.trim().toLowerCase();

  return (
    <>
      <section className="mkt-section" id="insurance-types">
        <div className="mkt-section-head">
          <div>
            <h2>Quick access</h2>
            <p>Jump straight to a class of insurance, the premium estimator, or the FAQ.</p>
          </div>
        </div>
        <div className="mkt-tile-grid">
          {categories.map((cat, i) => (
            <a key={cat.name} className="mkt-tile" href={`#cat-${i}`}>
              <span className="mkt-tile-icon">{categoryIcons[cat.name] || "📄"}</span>
              <span className="mkt-tile-label">{cat.name}</span>
            </a>
          ))}
          <a className="mkt-tile" href="#estimate">
            <span className="mkt-tile-icon">🧮</span>
            <span className="mkt-tile-label">Estimate a premium</span>
          </a>
          <Link className="mkt-tile" to={links.faq}>
            <span className="mkt-tile-icon">❓</span>
            <span className="mkt-tile-label">FAQ</span>
          </Link>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-section-head">
          <div>
            <h2>Explore all insurance types</h2>
            <p>{data?.nClasses ?? 0} classes across {categories.length} categories</p>
          </div>
        </div>
        {isLoading && <p>Loading…</p>}
        {!isLoading && (() => {
          const visibleCategories = categories
            .map((cat) => ({ cat, classes: cat.classes.filter((c) => !q || c.name.toLowerCase().includes(q)) }))
            .filter(({ classes }) => !q || classes.length > 0);
          return (
            <>
              {q && visibleCategories.length === 0 && <p className="empty-state">No insurance types match your search.</p>}
              {categories.map((cat, i) => {
                const classes = cat.classes.filter((c) => !q || c.name.toLowerCase().includes(q));
                if (q && classes.length === 0) return null;
                return (
                  <div className="card mkt-category" id={`cat-${i}`} key={cat.name}>
                    <h2>{categoryIcons[cat.name] || ""} {cat.name}</h2>
                    <div className="mkt-product-grid">
                      {classes.map((c) => (
                        <div className="mkt-product-card" key={c.name}>
                          <h3>{c.name}</h3>
                          <p>{c.summary}</p>
                          <div className="mkt-product-actions">
                            <Link className="btn btn-sm" to={links.quote(new URLSearchParams({ class: c.name }))}>Get a quote →</Link>
                            {estimable(c.name) && (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => estimateFor(c.name)}>Estimate premium</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}
      </section>

      <PremiumEstimator key={estimateClass} meta={quoteMeta.data} className={estimateClass} onClassChange={setEstimateClass} links={links} />

      <section className="mkt-section">
        <div className="card mkt-faq-teaser">
          <div>
            <h2>Have questions?</h2>
            <p>Browse scope of cover, benefits, exceptions and extensions for every class of business.</p>
          </div>
          <Link className="btn" to={links.faq}>Visit the FAQ →</Link>
        </div>
      </section>
    </>
  );
}

// ---------- In-app marketplace (staff app and customer portal) ----------
// The same catalogue without the public website's nav, hero, sign-in and footer, so it sits inside the
// shell it is opened from and every link stays there.
export function MarketplaceInApp({ links, eyebrow, intro, actions }: { links: MarketplaceLinks; eyebrow: string; intro: string; actions?: ReactNode }) {
  const [search, setSearch] = useState("");
  return (
    <div className="mkt-inapp">
      <div className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>Insurance Marketplace</h1>
          <p className="text-muted">{intro}</p>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <div className="faq-search-bar">
        <input type="search" placeholder="Search insurance types…" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search insurance types" />
      </div>
      <MarketplaceCatalogue links={links} search={search} />
    </div>
  );
}

// ---------- Public marketplace website (/marketplace) ----------
export function MarketplacePage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["marketplace"],
    queryFn: () => api.get<MarketplaceResponse>("/api/marketplace"),
  });

  const [search, setSearch] = useState("");
  const [signinForm, setSigninForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [signinError, setSigninError] = useState<string | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);

  async function handleSignin(e: FormEvent) {
    e.preventDefault();
    setSigninError(null);
    if (!(signinForm.first_name.trim() && signinForm.last_name.trim() && signinForm.email.trim())) {
      setSigninError("Please provide your first name, last name, and email.");
      return;
    }
    setSigninBusy(true);
    try {
      await api.post("/api/marketplace/signin", signinForm);
      await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
    } catch (err) {
      setSigninError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSigninBusy(false);
    }
  }

  async function handleSignout() {
    await api.post("/api/marketplace/signout");
    await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
  }

  return (
    <div className="mkt-body">
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link to="/marketplace">
            <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" />
          </Link>
          <div className="mkt-nav-links">
            <a href="#insurance-types">Insurance Types</a>
            <a href="#estimate">Estimate a premium</a>
            <Link to="/marketplace/faq">FAQ</Link>
          </div>
          <div className="mkt-nav-search">
            <input type="search" placeholder="Search insurance types…" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mkt-nav-right">
            {data?.guest ? (
              <>
                <span className="mkt-profile-pill">
                  <span className="mkt-profile-avatar">
                    {(data.guest.first_name[0] + data.guest.last_name[0]).toUpperCase()}
                  </span>
                  {data.guest.first_name}
                </span>
                <button className="btn btn-secondary btn-sm" type="button" onClick={handleSignout}>Sign out</button>
              </>
            ) : (
              <a className="btn btn-sm" href="#signin">Sign In</a>
            )}
          </div>
        </div>
      </nav>

      <header className="mkt-hero">
        <div className="mkt-hero-inner">
          <div>
            <h1>Find the right cover, faster.</h1>
            <p className="mkt-lede">
              Compare Motor, Property, Health, Life, Marine and Liability insurance placed through Green
              Pacific's insurer panel. Get an instant estimate, then apply for cover in minutes.
            </p>
          </div>

          {data?.guest ? (
            <div className="card mkt-profile-card" id="signin">
              <h2>Welcome back, {data.guest.first_name}</h2>
              <div className="detail-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div><div className="k">Name</div><div className="v">{data.guest.first_name} {data.guest.last_name}</div></div>
                <div><div className="k">Mobile</div><div className="v">{data.guest.phone || "—"}</div></div>
                <div><div className="k">Email</div><div className="v">{data.guest.email}</div></div>
              </div>
              <div className="form-actions">
                <Link className="btn" to="/marketplace/quote">Request a quote</Link>
                <Link className="btn btn-secondary" to="/kyc">Complete KYC</Link>
              </div>
            </div>
          ) : (
            <div className="card mkt-signin-card" id="signin">
              <h2>Sign in</h2>
              <p className="field-hint">Just your contact details — no password needed. We'll use this to personalize your visit and pick up where you left off.</p>
              {signinError && <div className="flash flash-error">{signinError}</div>}
              <form onSubmit={handleSignin}>
                <div className="form-grid mkt-signin-grid">
                  <div className="field">
                    <label htmlFor="first_name">First name <span className="required-mark">*</span></label>
                    <input type="text" id="first_name" required value={signinForm.first_name} onChange={(e) => setSigninForm({ ...signinForm, first_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="last_name">Last name <span className="required-mark">*</span></label>
                    <input type="text" id="last_name" required value={signinForm.last_name} onChange={(e) => setSigninForm({ ...signinForm, last_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Mobile number</label>
                    <input type="tel" id="phone" value={signinForm.phone} onChange={(e) => setSigninForm({ ...signinForm, phone: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="email">Email address <span className="required-mark">*</span></label>
                    <input type="email" id="email" required value={signinForm.email} onChange={(e) => setSigninForm({ ...signinForm, email: e.target.value })} />
                  </div>
                </div>
                <button className="btn" type="submit" style={{ width: "100%", marginTop: "1rem" }} disabled={signinBusy}>
                  {signinBusy ? "Creating…" : "Create my free profile"}
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <MarketplaceCatalogue links={PUBLIC_LINKS} search={search} />

      <footer className="mkt-footer">
        Green Pacific Insurance Brokers Ltd &middot; Insurance broker, Nigeria &middot;{" "}
        <Link to="/kyc">Start a KYC application</Link>
        <CompanyContact showName={false} />
      </footer>
    </div>
  );
}

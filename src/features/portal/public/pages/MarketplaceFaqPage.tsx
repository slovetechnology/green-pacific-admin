import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { CompanyContact } from "@/shared/components/CompanyContact";

interface FaqItem {
  q: string;
  a: string;
}
interface FaqClass {
  name: string;
  summary: string;
  scope: string[];
  benefits: string[];
  exceptions: string[];
  extensions: string[];
  other: string[];
  faqs?: FaqItem[];
}
interface FaqCategory {
  name: string;
  classes: FaqClass[];
}
interface FaqResponse {
  generalFaq: FaqItem[];
  categories: FaqCategory[];
  nClasses: number;
}

// A class matches a search on its name, its summary or any of its common questions and answers.
function classText(c: FaqClass) {
  return [c.name, c.summary, ...(c.faqs ?? []).flatMap((f) => [f.q, f.a])].join(" ").toLowerCase();
}

function publicApplyHref(className: string) {
  return `/kyc?class=${encodeURIComponent(className)}`;
}

// The searchable FAQ (general questions, then every class), shared by the public website and the
// customer portal's in-app FAQ. `applyHref` decides where "Apply for this cover" leads.
function FaqBody({ applyHref, intro }: { applyHref: (className: string) => string; intro: (nClasses: number) => ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace", "faq"],
    queryFn: () => api.get<FaqResponse>("/api/marketplace/faq"),
  });
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const generalFaq = data?.generalFaq ?? [];
  const categories = data?.categories ?? [];

  const filteredGeneral = useMemo(
    () => generalFaq.filter((item) => !q || `${item.q} ${item.a}`.toLowerCase().includes(q)),
    [generalFaq, q]
  );
  const filteredCategories = useMemo(
    () =>
      categories.map((cat) => ({
        ...cat,
        classes: cat.classes.filter((c) => !q || classText(c).includes(q)),
      })),
    [categories, q]
  );
  const totalVisible =
    filteredGeneral.length + filteredCategories.reduce((sum, cat) => sum + cat.classes.length, 0);

  return (
    <>
      {intro(data?.nClasses ?? 0)}
      <div className="faq-search-bar">
        <input
          type="search"
          placeholder="Search questions, answers or a class of business…"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="faq-search-count">{q ? `${totalVisible} match${totalVisible === 1 ? "" : "es"}` : ""}</span>
      </div>

      {isLoading && <p>Loading…</p>}

      {!isLoading && (
        <>
          {(!q || filteredGeneral.length > 0) && (
            <div className="card" id="faq-general">
              <h2>General questions</h2>
              <div className="faq-list">
                {filteredGeneral.map((item) => (
                  <details className="faq-item" open={!!q} key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          <div className="faq-jump" role="navigation" aria-label="Jump to category">
            {categories.map((cat, i) => (
              <a key={cat.name} href={`#faq-cat-${i}`} className="faq-jump-link">
                {cat.name}<span className="n">{cat.classes.length}</span>
              </a>
            ))}
          </div>

          {filteredCategories.map((cat, i) => {
            if (q && cat.classes.length === 0) return null;
            return (
              <div className="card" id={`faq-cat-${i}`} style={{ marginTop: "1.25rem" }} key={cat.name}>
                <h2>{cat.name}</h2>
                <div className="faq-list">
                  {cat.classes.map((c) => (
                    <details className="faq-item faq-class" open={!!q} key={c.name}>
                      <summary>{c.name}</summary>
                      <p className="faq-class-summary">{c.summary}</p>
                      <div className="faq-class-grid">
                        <div className="faq-class-section">
                          <h4>Scope of cover</h4>
                          <ul>{c.scope.map((line) => <li key={line}>{line}</li>)}</ul>
                        </div>
                        <div className="faq-class-section">
                          <h4>Benefits</h4>
                          <ul>{c.benefits.map((line) => <li key={line}>{line}</li>)}</ul>
                        </div>
                        <div className="faq-class-section">
                          <h4>Exceptions</h4>
                          <ul>{c.exceptions.map((line) => <li key={line}>{line}</li>)}</ul>
                        </div>
                        <div className="faq-class-section">
                          <h4>Extensions</h4>
                          <ul>{c.extensions.map((line) => <li key={line}>{line}</li>)}</ul>
                        </div>
                        {c.other.length > 0 && (
                          <div className="faq-class-section">
                            <h4>Other benefits</h4>
                            <ul>{c.other.map((line) => <li key={line}>{line}</li>)}</ul>
                          </div>
                        )}
                      </div>
                      {(c.faqs?.length ?? 0) > 0 && (
                        <div className="faq-class-questions">
                          <h4>Common questions</h4>
                          {c.faqs!.map((f) => (
                            <div className="faq-class-qa" key={f.q}>
                              <p className="faq-class-q">{f.q}</p>
                              <p>{f.a}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="form-actions">
                        <Link className="btn btn-secondary btn-sm" to={applyHref(c.name)}>Apply for this cover →</Link>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}

          {q && totalVisible === 0 && (
            <p className="faq-empty-state empty-state">No questions or classes match your search.</p>
          )}
        </>
      )}
    </>
  );
}

// The FAQ inside the customer portal (/portal/faq): no website nav, and applying opens the portal's own
// Request a Quote page.
export function MarketplaceFaqInApp({ eyebrow, applyHref }: { eyebrow: string; applyHref: (className: string) => string }) {
  return (
    <div className="mkt-inapp">
      <FaqBody
        applyHref={applyHref}
        intro={(n) => (
          <div className="page-header">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>Insurance FAQ</h1>
              <p className="text-muted">
                General, typical Nigerian-market terms across {n} classes of business. The actual cover, exceptions and
                extensions are set by the policy wording and schedule the insurer issues.
              </p>
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function MarketplaceFaqPage() {
  return (
    <div className="mkt-body">
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link to="/marketplace">
            <img src="/logo.png" alt="Green Pacific Insurance Brokers Ltd" />
          </Link>
          <div className="mkt-nav-links">
            <Link to="/marketplace#insurance-types">Insurance Types</Link>
            <Link to="/marketplace#estimate">Estimate a premium</Link>
            <Link to="/marketplace/faq">FAQ</Link>
          </div>
          <div className="mkt-nav-right">
            <Link className="btn btn-sm" to="/marketplace">← Marketplace</Link>
          </div>
        </div>
      </nav>

      <div className="mkt-section" style={{ paddingTop: "2rem" }}>
        <FaqBody
          applyHref={publicApplyHref}
          intro={(n) => (
            <div className="mkt-section-head">
              <div>
                <h2>Insurance FAQ</h2>
                <p>
                  General, typical Nigerian-market terms across {n} classes of business — for
                  your reference before applying. Actual scope of cover, exceptions and extensions are set by
                  the policy wording and schedule issued by the underwriting insurer.
                </p>
              </div>
            </div>
          )}
        />
      </div>

      <footer className="mkt-footer">
        Green Pacific Insurance Brokers Ltd &middot; <Link to="/marketplace">Back to the marketplace</Link>
        <CompanyContact showName={false} />
      </footer>
    </div>
  );
}

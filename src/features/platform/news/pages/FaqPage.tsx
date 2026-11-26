import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

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

export function FaqPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["faq"],
    queryFn: () => api.get<FaqResponse>("/api/faq"),
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
        classes: cat.classes.filter((c) => !q || c.name.toLowerCase().includes(q)),
      })),
    [categories, q]
  );
  const totalVisible =
    filteredGeneral.length + filteredCategories.reduce((sum, cat) => sum + cat.classes.length, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>Insurance FAQ</h1>
        </div>
      </div>
      <p className="period-note">
        General, typical Nigerian-market terms across {data?.nClasses ?? 0} classes of business — for staff
        reference and client education. Actual scope of cover, exceptions and extensions are governed by
        the specific policy wording and schedule issued by the underwriting insurer; always confirm against
        the client's actual document.
      </p>

      <div className="faq-search-bar">
        <input
          type="search"
          placeholder="Search questions or a class of business…"
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
    </div>
  );
}

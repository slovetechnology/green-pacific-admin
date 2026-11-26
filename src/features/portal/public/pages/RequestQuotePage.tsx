import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { CompanyContact } from "@/shared/components/CompanyContact";
import { RequestQuoteForm, answersFromParams, type FormMeta } from "../components/RequestQuoteForm";

// The public Request for Quote page (/marketplace/quote).

interface Guest {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}

export function RequestQuotePage() {
  const [searchParams] = useSearchParams();
  const meta = useQuery({ queryKey: ["rfq-form"], queryFn: () => api.get<FormMeta>("/api/marketplace/quote/form") });
  const guest = useQuery({ queryKey: ["marketplace"], queryFn: () => api.get<{ guest: Guest | null }>("/api/marketplace") });
  const g = guest.data?.guest;
  const contact = useMemo(
    () => (g ? { contact_name: `${g.first_name} ${g.last_name}`.trim(), contact_email: g.email, contact_phone: g.phone || "" } : null),
    [g],
  );
  const initialAnswers = useMemo(() => answersFromParams(searchParams), [searchParams]);
  const ackHours = meta.data?.ackHours ?? 24;

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
        <div className="mkt-section-head">
          <div>
            <h2>Request a quote</h2>
            <p>Tell us about what you want to insure. We compare our insurer panel and send your premium quote within {ackHours} hours.</p>
          </div>
        </div>

        {meta.isLoading ? (
          <p>Loading…</p>
        ) : !meta.data ? (
          <div className="flash flash-error">The quote form could not be loaded. Please refresh the page or call us.</div>
        ) : (
          <RequestQuoteForm
            meta={meta.data}
            submitUrl="/api/marketplace/quote"
            initialClass={searchParams.get("class")}
            initialAnswers={initialAnswers}
            contact={contact}
            honeypot
            doneActions={<Link className="btn" to="/marketplace">Back to the marketplace</Link>}
          />
        )}
      </div>

      <footer className="mkt-footer">
        Green Pacific Insurance Brokers Ltd &middot; <Link to="/marketplace">Back to the marketplace</Link>
        <CompanyContact showName={false} />
      </footer>
    </div>
  );
}

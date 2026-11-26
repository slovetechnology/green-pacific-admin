import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RequestQuoteForm, answersFromParams, type FormMeta } from "../components/RequestQuoteForm";
import { MarketplaceInApp, type MarketplaceLinks } from "./MarketplacePage";

// The marketplace inside the staff app (/insurance-marketplace): same covers and estimator as the
// public website, but it stays in the app shell, and "Get a quote" opens the quote form here too, so a
// member of staff can price a cover with a client on the phone and log the request without leaving.
const STAFF_LINKS: MarketplaceLinks = {
  quote: (params) => `/insurance-marketplace/quote?${params}`,
  faq: "/faq",
};

export function StaffMarketplacePage() {
  return (
    <MarketplaceInApp
      links={STAFF_LINKS}
      eyebrow="Clients & CRM"
      intro="Browse every cover we place, estimate a premium with a client, and log their quote request. This is what clients see on the website."
      actions={
        // The one deliberate way out: to check the public website exactly as clients see it.
        <a className="btn btn-secondary btn-sm" href="/marketplace" target="_blank" rel="noopener noreferrer">
          View the public website ↗
        </a>
      }
    />
  );
}

export function StaffQuoteRequestPage() {
  const [searchParams] = useSearchParams();
  const meta = useQuery({ queryKey: ["rfq-form"], queryFn: () => api.get<FormMeta>("/api/marketplace/quote/form") });
  const initialAnswers = useMemo(() => answersFromParams(searchParams), [searchParams]);

  return (
    <div className="mkt-inapp">
      <div className="page-header">
        <div>
          <p className="eyebrow">Insurance Marketplace</p>
          <h1>Request a quote</h1>
          <p className="text-muted">
            Enter the client's details and what they want to insure. The request goes to Inbox: Quote Requests, and the client
            gets the usual acknowledgement email.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary btn-sm" to="/insurance-marketplace">← Marketplace</Link>
        </div>
      </div>
      {meta.isLoading ? (
        <p>Loading…</p>
      ) : !meta.data ? (
        <div className="flash flash-error">The quote form could not be loaded. Please refresh the page.</div>
      ) : (
        <RequestQuoteForm
          meta={meta.data}
          submitUrl="/api/marketplace/quote"
          initialClass={searchParams.get("class")}
          initialAnswers={initialAnswers}
          doneActions={
            <>
              <Link className="btn" to="/quote-requests">Open Inbox: Quote Requests</Link>{" "}
              <Link className="btn btn-secondary" to="/insurance-marketplace">Back to the marketplace</Link>
            </>
          }
        />
      )}
    </div>
  );
}

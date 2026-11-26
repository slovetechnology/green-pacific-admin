import { MarketplaceInApp, type MarketplaceLinks } from "@/features/portal/public/pages/MarketplacePage";
import { MarketplaceFaqInApp } from "@/features/portal/public/pages/MarketplaceFaqPage";

// The marketplace and FAQ inside the customer portal (/portal/marketplace, /portal/faq), so a signed-in
// customer keeps the portal's menu, and "Get a quote" opens the portal's own Request a Quote page,
// filed against their account, with the estimator's answers carried over.
const PORTAL_LINKS: MarketplaceLinks = {
  quote: (params) => `/portal/quotes?${params}`,
  faq: "/portal/faq",
};
const portalQuoteHref = (className: string) => `/portal/quotes?class=${encodeURIComponent(className)}`;

export function PortalMarketplacePage() {
  return (
    <MarketplaceInApp
      links={PORTAL_LINKS}
      eyebrow="Customer Portal"
      intro="Explore the covers we arrange, get an instant estimate, then request an exact quote."
    />
  );
}

export function PortalFaqPage() {
  return <MarketplaceFaqInApp eyebrow="Customer Portal" applyHref={portalQuoteHref} />;
}

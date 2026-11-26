// Mounted once at the app root (root.tsx). It records click ids / UTMs from the address on every navigation (storage
// rules in adAttribution.ts) and loads GTM and the Meta Pixel a single time, the first time a public marketing page
// (/quote/...) is shown. Staff pages never load the tags: their addresses carry client and policy ids, which must not
// go to Google or Meta (Nigeria Data Protection Act). Route changes inside the SPA fire no extra Pixel PageView.
import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { captureAttribution, initAdTags, isMarketingPath } from "./adAttribution";

export function AdTrackingProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    if (isMarketingPath(location.pathname)) initAdTags();
  }, [location.pathname]);
  useEffect(() => {
    captureAttribution();
  }, [location.search]);
  return <>{children}</>;
}

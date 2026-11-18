import { RequireAdmin } from "@/app/guards/RouteGuards";
import { PortalEnquiryDetailPage } from "@/features/clients/portal/pages/PortalEnquiryDetailPage";

// Admins only (the backend refuses everyone else on /api/customer-enquiries).
export default function Route() {
  return <RequireAdmin><PortalEnquiryDetailPage /></RequireAdmin>;
}

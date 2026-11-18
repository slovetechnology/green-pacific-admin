import { RequireAdmin } from "@/app/guards/RouteGuards";
import { PortalEnquiriesPage } from "@/features/clients/portal/pages/PortalEnquiriesPage";

// Admins only (the backend refuses everyone else on /api/customer-enquiries).
export default function Route() {
  return <RequireAdmin><PortalEnquiriesPage /></RequireAdmin>;
}

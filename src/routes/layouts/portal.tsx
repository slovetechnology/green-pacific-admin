import { Outlet } from "react-router";
import { PortalAuthProvider } from "@/features/portal/customer-portal/PortalAuthContext";

// The customer-portal session is mounted only while the user is inside /portal/*,
// so staff pages never fire /api/portal/me.
export default function PortalLayout() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  );
}

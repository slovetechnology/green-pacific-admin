import { Outlet } from "react-router";
import { StaffGate } from "@/app/guards/RouteGuards";
import { HrAccessProvider } from "@/features/people/hr-admin/context/HrAccessContext";

// Staff only; the capability each page needs is checked by that page's route (RequireHrAccess).
export default function HrAdminLayout() {
  return (
    <StaffGate>
      <HrAccessProvider>
        <Outlet />
      </HrAccessProvider>
    </StaffGate>
  );
}

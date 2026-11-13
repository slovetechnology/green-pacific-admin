import { Outlet } from "react-router";
import { StaffGate } from "@/app/guards/RouteGuards";

export default function StaffLayout() {
  return (
    <StaffGate>
      <Outlet />
    </StaffGate>
  );
}

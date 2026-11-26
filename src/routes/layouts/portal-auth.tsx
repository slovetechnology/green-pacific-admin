import { Outlet } from "react-router";
import { RequirePortalAuth } from "@/app/guards/RouteGuards";

export default function PortalAuthLayout() {
  return (
    <RequirePortalAuth>
      <Outlet />
    </RequirePortalAuth>
  );
}

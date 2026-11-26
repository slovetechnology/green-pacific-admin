import { Outlet } from "react-router";
import { RequireAdmin } from "@/app/guards/RouteGuards";

export default function AdminLayout() {
  return (
    <RequireAdmin>
      <Outlet />
    </RequireAdmin>
  );
}

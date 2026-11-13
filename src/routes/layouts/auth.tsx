import { Outlet } from "react-router";
import { RequireAuth } from "@/app/guards/RouteGuards";

export default function AuthLayout() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

import { Outlet } from "react-router";
import { RequireHr } from "@/app/guards/RouteGuards";

export default function HrLayout() {
  return (
    <RequireHr>
      <Outlet />
    </RequireHr>
  );
}

import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalHrLayout() {
  return (
    <RequireAppraisal need="hr">
      <Outlet />
    </RequireAppraisal>
  );
}

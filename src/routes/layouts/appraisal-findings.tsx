import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalFindingsLayout() {
  return (
    <RequireAppraisal need="findings">
      <Outlet />
    </RequireAppraisal>
  );
}

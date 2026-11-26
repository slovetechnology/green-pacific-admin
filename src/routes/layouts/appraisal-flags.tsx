import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalFlagsLayout() {
  return (
    <RequireAppraisal need="flags">
      <Outlet />
    </RequireAppraisal>
  );
}

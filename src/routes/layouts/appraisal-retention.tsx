import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalRetentionLayout() {
  return (
    <RequireAppraisal need="retention">
      <Outlet />
    </RequireAppraisal>
  );
}

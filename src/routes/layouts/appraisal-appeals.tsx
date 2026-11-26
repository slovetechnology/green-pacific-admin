import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalAppealsLayout() {
  return (
    <RequireAppraisal need="appeals">
      <Outlet />
    </RequireAppraisal>
  );
}

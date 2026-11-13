import { Outlet } from "react-router";
import { RequireAppraisal } from "@/app/guards/RouteGuards";

export default function AppraisalBoardLayout() {
  return (
    <RequireAppraisal need="board">
      <Outlet />
    </RequireAppraisal>
  );
}

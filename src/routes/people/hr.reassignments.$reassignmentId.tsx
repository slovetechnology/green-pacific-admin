import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { ReassignmentDetailPage } from "@/features/people/hr-admin/pages/ReassignmentDetailPage";

export default function Route() {
  return (
    <RequireHrAccess need="viewReassignments">
      <ReassignmentDetailPage />
    </RequireHrAccess>
  );
}

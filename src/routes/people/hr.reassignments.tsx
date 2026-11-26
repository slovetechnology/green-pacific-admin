import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { ReassignmentsPage } from "@/features/people/hr-admin/pages/ReassignmentsPage";

export default function Route() {
  return (
    <RequireHrAccess need="viewReassignments">
      <ReassignmentsPage />
    </RequireHrAccess>
  );
}

import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { ReassignmentWizardPage } from "@/features/people/hr-admin/pages/ReassignmentWizardPage";

export default function Route() {
  return (
    <RequireHrAccess need="managePay">
      <ReassignmentWizardPage />
    </RequireHrAccess>
  );
}

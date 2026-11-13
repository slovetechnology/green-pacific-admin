import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { LicenceImportPage } from "@/features/people/hr-admin/pages/LicenceImportPage";

export default function Route() {
  return (
    <RequireHrAccess need="manageCompliance">
      <LicenceImportPage />
    </RequireHrAccess>
  );
}

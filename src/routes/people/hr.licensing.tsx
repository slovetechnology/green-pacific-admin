import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { LicensingPage } from "@/features/people/hr-admin/pages/LicensingPage";

export default function Route() {
  return (
    <RequireHrAccess need="manageCompliance">
      <LicensingPage />
    </RequireHrAccess>
  );
}

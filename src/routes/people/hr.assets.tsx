import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { AssetsPage } from "@/features/people/hr-admin/pages/AssetsPage";

export default function Route() {
  return (
    <RequireHrAccess need="managePay">
      <AssetsPage />
    </RequireHrAccess>
  );
}

import { RequireHrAccess } from "@/features/people/hr-admin/context/HrAccessContext";
import { PayPage } from "@/features/people/hr-admin/pages/PayPage";

export default function Route() {
  return (
    <RequireHrAccess need="readPay">
      <PayPage />
    </RequireHrAccess>
  );
}

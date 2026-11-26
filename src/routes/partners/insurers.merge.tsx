import { InsurerMergePage } from "@/features/partners/insurers/pages/InsurerMergePage";
import { RequireAdmin } from "@/app/guards/RouteGuards";

export default function Route() {
  return (
    <RequireAdmin>
      <InsurerMergePage />
    </RequireAdmin>
  );
}

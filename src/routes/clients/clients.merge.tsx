import { ClientMergePage } from "@/features/clients/clients/pages/ClientMergePage";
import { RequireAdmin } from "@/app/guards/RouteGuards";

export default function Route() {
  return (
    <RequireAdmin>
      <ClientMergePage />
    </RequireAdmin>
  );
}

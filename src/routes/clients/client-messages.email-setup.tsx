import { EmailRepliesSetupPage } from "@/features/clients/messages/pages/EmailRepliesSetupPage";
import { RequireAdmin } from "@/app/guards/RouteGuards";

export default function Route() {
  return (
    <RequireAdmin>
      <EmailRepliesSetupPage />
    </RequireAdmin>
  );
}

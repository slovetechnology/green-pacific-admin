import { InsurerDirectoryImportPage } from "@/features/partners/insurers/pages/InsurerDirectoryImportPage";
import { RequireAdmin } from "@/app/guards/RouteGuards";

export default function Route() {
  return (
    <RequireAdmin>
      <InsurerDirectoryImportPage />
    </RequireAdmin>
  );
}

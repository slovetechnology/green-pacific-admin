import type { ReactNode } from "react";
import { useAuth } from "@/features/platform/auth/AuthContext";

// Presentation only — hides write/admin UI for read-only roles. The real
// enforcement is the backend's requireWrite/requireAdmin middleware; a
// hidden button here is a UX nicety, not a security boundary.
export function RoleGate({ need, children }: { need: "write" | "admin"; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (need === "admin" && !user.isAdmin) return null;
  if (need === "write" && !user.canWrite) return null;
  return <>{children}</>;
}

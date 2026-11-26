import { type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { AppShell } from "@/app/layout/AppShell";
import { RESET_TOKEN_PARAM, SignInScreen } from "@/features/platform/auth/pages/SignInScreen";
import { SessionCheck } from "@/features/platform/auth/components/SessionCheck";
import { appraisalAccess } from "@/features/people/appraisal/lib/appraisalTypes";

// Every staff page sits in this layout. Whether someone is signed in is the server's answer to
// GET /api/auth/me (and any 401 re-asks it, app/providers/queryClient.ts); signed out, the sign-in screen
// is shown at the same address, and the page appears once the server accepts the sign-in. An emailed
// password reset link (?reset_token=) shows the reset view even to someone signed in.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [params] = useSearchParams();
  if (isLoading) return <SessionCheck />;
  if (!user || params.has(RESET_TOKEN_PARAM)) return <SignInScreen />;
  return <AppShell>{children}</AppShell>;
}

// Staff only: the backend refuses agents on every sub-broker route (agentGate).
export function StaffGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.isAgent) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Admins, plus users holding the "hr" appraisal role (backend lib/orgAccess.js).
export function RequireHr({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user?.isHr) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Appraisal HR (admin, "hr" or "md") and conduct-flag handlers (those plus
// "compliance"). Presentation only; the backend re-checks.
export function RequireAppraisal({ need, children }: { need: "hr" | "flags" | "appeals" | "findings" | "board" | "retention"; children: ReactNode }) {
  const { user } = useAuth();
  if (!appraisalAccess(user)[need]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

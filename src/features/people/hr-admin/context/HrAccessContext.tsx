import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@/features/platform/auth/AuthContext";

// What the signed-in person may do in the HR / admin screens. This mirrors backend/src/modules/hr/hrCommon.js
// and is presentation only: the API re-checks every request from the database.
export interface HrAccess {
  // Licences, appointments, CE and E&O: admin, HR, Compliance.
  manageCompliance: boolean;
  // Assets and pay: admin, HR.
  managePay: boolean;
  // Pay is readable by the MD as well.
  readPay: boolean;
  // Book reassignment is visible to HR and the MD; only the MD (or admin) decides.
  viewReassignments: boolean;
  decideReassignments: boolean;
}

const NONE: HrAccess = { manageCompliance: false, managePay: false, readPay: false, viewReassignments: false, decideReassignments: false };
const Ctx = createContext<HrAccess>(NONE);

export function hrAccessFor(user: { isAdmin: boolean; appraisalRoles?: string[] } | null): HrAccess {
  if (!user) return NONE;
  const roles = user.appraisalRoles ?? [];
  const admin = user.isAdmin;
  const hr = admin || roles.includes("hr");
  const md = admin || roles.includes("md");
  return {
    manageCompliance: hr || roles.includes("compliance"),
    managePay: hr,
    readPay: hr || md,
    viewReassignments: hr || md,
    decideReassignments: md,
  };
}

export function HrAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useMemo(() => hrAccessFor(user), [user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useHrAccess = () => useContext(Ctx);

// Route guard: sends anyone without the capability to the home page.
export function RequireHrAccess({ need, children }: { need: keyof HrAccess; children: ReactNode }) {
  const access = useHrAccess();
  if (!access[need]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

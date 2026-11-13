import { useAuth } from "@/features/platform/auth/AuthContext";

// Presentation only: the API (leadPortal.routes.js) is the real guard. Admins run the engine and change the
// setup; admins and editors work leads and add them to the pipeline; viewers read.
export function useIsAdmin() {
  return !!useAuth().user?.isAdmin;
}

export function useCanWorkLeads() {
  return !!useAuth().user?.canWrite;
}

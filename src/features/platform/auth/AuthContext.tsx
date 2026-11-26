import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, COOKIE_BLOCKED_MESSAGE } from "@/shared/api/client";

export interface CurrentUser {
  id: number;
  // Internal key that tasks and records refer to; never shown. People are shown by `name`.
  username: string;
  firstName: string;
  lastName: string;
  // The sign-in.
  email: string;
  // "First Last" (the email for an account with no name yet).
  name: string;
  role: "admin" | "editor" | "viewer" | "agent";
  isAdmin: boolean;
  canWrite: boolean;
  // Read-only, scoped to the clients they account-manage (backend lib/scope.js).
  isAgent: boolean;
  branchId: number | null;
  // Appraisal capabilities (backend lib/orgAccess.js). isHr = admin or the
  // "hr" role; it gates the People & Org pages.
  appraisalRoles: string[];
  isHr: boolean;
  // Two-factor sign-in became required for them after they signed in: the app asks them to set it up first.
  mfaSetupRequired?: boolean;
}

/** What the password step leads to: signed in, or a two-factor step (a code, or setting it up). */
export type LoginStep = "done" | "verify" | "setup";

interface MeResponse {
  user: CurrentUser | null;
  portalPendingCount?: number;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  portalPendingCount: number;
  login: (email: string, password: string) => Promise<LoginStep>;
  // After the two-factor step: confirm the session and show the app.
  finishSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<MeResponse>("/api/auth/me"),
  });

  async function login(email: string, password: string): Promise<LoginStep> {
    const res = await api.post<{ user?: CurrentUser; mfa?: "verify" | "setup" }>("/api/auth/login", { email, password });
    if (res.mfa) return res.mfa;
    await finishSignIn();
    return "done";
  }

  async function finishSignIn() {
    // Confirm the browser kept the session cookie. A browser that blocks the API's cookie (a
    // third-party cookie when the site and the API are on different sites) accepts the login reply
    // but sends no cookie afterwards, so every page would fail as "not signed in".
    const me = await api.get<MeResponse>("/api/auth/me");
    if (!me.user) throw new ApiError(COOKIE_BLOCKED_MESSAGE, 401);
    queryClient.setQueryData(["me"], me);
  }

  async function logout() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      // Drop the local session even if the call failed (e.g. it had already expired).
      queryClient.setQueryData(["me"], { user: null });
      queryClient.clear();
    }
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        portalPendingCount: data?.portalPendingCount ?? 0,
        isLoading,
        login,
        finishSignIn,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

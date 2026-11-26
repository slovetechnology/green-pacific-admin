import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, COOKIE_BLOCKED_MESSAGE } from "@/shared/api/client";

export interface PortalCustomer {
  id: number;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface PortalClient {
  id: number;
  name: string;
}

interface MeResponse {
  customer: PortalCustomer;
  client: PortalClient;
  paystackEnabled: boolean;
}

interface PortalAuthContextValue {
  customer: PortalCustomer | null;
  client: PortalClient | null;
  paystackEnabled: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<PortalCustomer>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-me"],
    queryFn: () => api.get<MeResponse>("/api/portal/me"),
    retry: false,
  });

  async function login(email: string, password: string) {
    const result = await api.post<{ customer: PortalCustomer }>("/api/portal/login", { email, password });
    // Confirm the browser kept the session cookie (see the staff login in AuthContext).
    const me = await api.get<MeResponse>("/api/portal/me").catch((err) => {
      throw err instanceof ApiError && err.status === 401 ? new ApiError(COOKIE_BLOCKED_MESSAGE, 401) : err;
    });
    if (!me?.customer) throw new ApiError(COOKIE_BLOCKED_MESSAGE, 401);
    queryClient.setQueryData(["portal-me"], me);
    return result.customer;
  }

  async function logout() {
    await api.post("/api/portal/logout");
    queryClient.setQueryData(["portal-me"], undefined);
    queryClient.clear();
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["portal-me"] });
  }

  return (
    <PortalAuthContext.Provider
      value={{
        customer: !isError && data ? data.customer : null,
        client: !isError && data ? data.client : null,
        paystackEnabled: data?.paystackEnabled ?? false,
        isLoading,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";

// A read that fails because the connection dropped (common on mobile data) or because the API was
// waking up or restarting (502/503 from the host) is tried twice more before the page shows an error.
// Real answers (400s, 500s, our own timeout) are not retried.
export function isTransientError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 502 || error.status === 503;
  return error instanceof TypeError; // fetch() itself failed: offline, DNS, connection reset, CORS on a proxy error page
}

// A page that is told "not signed in" re-checks the session, so an ended session sends the user to
// the sign-in page (the route guards follow /api/auth/me) instead of leaving every page in error.
const SESSION_KEYS = new Set(["me", "portal-me"]);

function recheckSession(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  void queryClient.invalidateQueries({ queryKey: ["me"] });
  void queryClient.invalidateQueries({ queryKey: ["portal-me"] });
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (SESSION_KEYS.has(String(query.queryKey[0]))) return;
      recheckSession(error);
    },
  }),
  mutationCache: new MutationCache({ onError: (error) => recheckSession(error) }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => failureCount < 2 && isTransientError(error),
      retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

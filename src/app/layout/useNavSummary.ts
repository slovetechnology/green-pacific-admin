import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// GET /api/nav/summary: counts for the sidebar badges and the stats panel. Agents only receive figures
// for their own book, so the staff-only counts are optional.
export interface NavSummary {
  renewals: { total: number; urgent: number };
  claimsOpen: number;
  tasksOpen?: number;
  quoteRequestsNew?: number;
  messagesNew?: number;
  complianceOpen?: number;
  stats: { tier: "executive" | "branch" | "producer"; gwpYtd: number; activePolicies: number };
}

export interface NavBadge {
  text: string;
  tone: "crit" | "warn" | "muted";
}

// Which sidebar link carries which figure. A link with nothing to report gets no badge.
export function badgeFor(to: string, s: NavSummary | undefined): NavBadge | null {
  if (!s) return null;
  const count = (n: number | undefined, word: string, tone: NavBadge["tone"] = "muted"): NavBadge | null => (n ? { text: `${n} ${word}`, tone } : null);
  switch (to) {
    case "/renewals":
      return s.renewals.urgent > 0 ? { text: `${s.renewals.urgent} urgent`, tone: "crit" } : count(s.renewals.total, "due");
    case "/claims":
      return count(s.claimsOpen, "open");
    case "/tasks":
      return count(s.tasksOpen, "open");
    case "/quote-requests":
      return count(s.quoteRequestsNew, "new", "warn");
    case "/client-messages":
      return count(s.messagesNew, "to reply", "warn");
    case "/policy-compliance":
      return count(s.complianceOpen, "open", "warn");
    default:
      return null;
  }
}

export function useNavSummary(enabled: boolean) {
  return useQuery({
    queryKey: ["nav-summary"],
    queryFn: () => api.get<NavSummary>("/api/nav/summary"),
    enabled,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

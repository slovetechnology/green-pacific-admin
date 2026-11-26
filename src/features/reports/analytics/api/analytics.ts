import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DIMENSIONS, type AnalyticsFilters } from "../store/analyticsStore";

export interface RenewalItem {
  id: number;
  client: string;
  policyNo: string | null;
  classOfBusiness: string | null;
  insurer: string;
  endDate: string;
  premium: number;
  daysLeft: number;
}

// Policies expiring in the window that have no renewal quote yet.
export interface AnalyticsRenewals {
  windowDays: number;
  count: number;
  premium: number;
  expiring: number;
  items: RenewalItem[];
}

// What the server decided the caller may see (the limits themselves are enforced server-side).
export interface AnalyticsAccess {
  tier: "executive" | "branch" | "producer";
  lockedProducer: string | null;
  branchId: number | null;
  leaderboard: "all" | "self";
}

export interface RankedRow {
  name: string;
  premium: number;
  commission: number;
  policies: number;
  id?: number;
}

export interface StatePremium {
  state: string;
  // False for states the map graphic does not draw; they still appear in the matrix.
  mapped: boolean;
  policies: number;
  premium: number;
}

export interface Geography {
  states: StatePremium[];
  unplaced: { policies: number; premium: number };
  // Premium by class (rows) and top states (columns); `pct` is the cell's share of the largest cell.
  matrix: { colLabels: string[]; rows: { label: string; cells: { value: number; pct: number }[] }[] } | null;
}

// Premium by client (rows, biggest first) and class (columns). `pct` is the cell's share of the largest
// cell; `share` is the client's part of all premium in the window.
export interface ClientHeatmap {
  classes: string[];
  total: number;
  topShare: number;
  clients: { id: number; name: string; premium: number; share: number; cells: { value: number; pct: number }[] }[];
}

// Next four quarters extrapolated from the last twelve completed quarters of bookings. `*Low`/`*High`
// bound an 80% prediction range. Null when the book has fewer than four quarters of history.
export interface RevenueForecast {
  history: { key: string; label: string; gwp: number; commission: number }[];
  projection: { key: string; label: string; gwp: number; gwpLow: number; gwpHigh: number; commission: number; commissionLow: number; commissionHigh: number }[];
  seasonal: boolean;
  quarters: number;
  totals: { gwp: number; gwpLow: number; gwpHigh: number; commission: number; gwpGrowthPct: number | null; commissionGrowthPct: number | null };
}

export interface AnalyticsResponse {
  // True only on a database with no policies at all: every figure is illustrative.
  sample: boolean;
  year: number;
  window: { from: string; to: string };
  kpis: {
    gwp: { value: number; deltaPct: number | null };
    newPolicies: { value: number; deltaPct: number | null };
    activePolicies: { value: number; deltaPct: number | null };
    commission: { value: number; deltaPct: number | null };
    lossRatio: { valuePct: number | null; deltaPts: number | null; incurred: number; claimCount: number };
    renewalRate: { valuePct: number | null; deltaPts: number | null; expired: number; renewed: number };
  };
  series: { ym: string; month: string; gwp: number; commission: number }[];
  lineOfBusiness: { line: string; policies: number; premium: number }[];
  topCarriers: RankedRow[];
  brokers: RankedRow[];
  geography: Geography;
  clientHeatmap: ClientHeatmap | null;
  forecast: RevenueForecast | null;
  renewals: AnalyticsRenewals;
  pipeline: { stages: { stage: string; label: string; count: number; value: number }[]; quoteToBind: { quoted: number; bound: number; ratePct: number | null } };
  access: AnalyticsAccess;
  options: { insurers: { id: number; name: string }[]; classes: string[]; brokers: string[]; businessTypes: string[]; statuses: string[] };
  cached: boolean;
  generatedAt: string;
}

export interface PolicyRow {
  id: number;
  transDate: string;
  policyNo: string | null;
  client: string;
  insurer: string;
  classOfBusiness: string | null;
  businessType: string | null;
  producer: string | null;
  startDate: string | null;
  endDate: string | null;
  premium: number;
  commission: number;
  status: string | null;
}

export interface PolicyPage {
  rows: PolicyRow[];
  total: number;
  page: number;
  totalPages: number;
  perPage: number;
  totals: { premium: number; commission: number };
}

export interface TableState {
  page: number;
  perPage: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
}

// The query string both endpoints understand. Empty values are left out, so the URL (and the cache key)
// only changes when a filter does.
export function filterParams(f: AnalyticsFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from && f.to) {
    p.set("from", f.from);
    p.set("to", f.to);
  } else if (f.year) {
    p.set("year", String(f.year));
  }
  for (const d of DIMENSIONS) {
    const v = f[d.key];
    if (v !== null && v !== "") p.set(d.key, String(v));
  }
  return p;
}

// One request feeds every widget. keepPreviousData holds the old figures on screen while a new slice
// loads, so toggling a filter never flashes the page empty.
export function useAnalytics(filters: AnalyticsFilters) {
  const qs = filterParams(filters).toString();
  return useQuery({
    queryKey: ["analytics-dashboard", qs],
    queryFn: () => api.get<AnalyticsResponse>(`/api/analytics/dashboard${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function usePolicyTable(filters: AnalyticsFilters, table: TableState) {
  const p = filterParams(filters);
  p.set("page", String(table.page));
  p.set("per_page", String(table.perPage));
  p.set("sort", table.sort);
  p.set("dir", table.dir);
  if (table.q) p.set("q", table.q);
  const qs = p.toString();
  return useQuery({
    queryKey: ["analytics-policies", qs],
    queryFn: () => api.get<PolicyPage>(`/api/analytics/policies?${qs}`),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function refreshAnalytics(filters: AnalyticsFilters) {
  const p = filterParams(filters);
  p.set("refresh", "1");
  return api.get<AnalyticsResponse>(`/api/analytics/dashboard?${p.toString()}`);
}

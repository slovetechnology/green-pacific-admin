import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type KpiView = "executive" | "manager" | "producer";

// Percent change vs the same span last year.
interface WithDeltaPct {
  deltaPct: number | null;
}
// Change in a rate, in percentage points.
interface WithDeltaPts {
  deltaPts: number | null;
}

export interface AgingBucket {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export interface SeriesPoint {
  month: string;
  // null for months that haven't happened yet in the current year.
  gwp: number | null;
  commission: number | null;
  priorGwp: number;
  priorCommission: number;
}

export interface StageRow {
  stage: string;
  count: number;
  value: number;
  weighted: number;
}

export interface Pipeline {
  openCount: number;
  openValue: number;
  weightedValue: number;
  byStage: StageRow[];
}

export interface UnitEconomics {
  newClients: number;
  acquisitionSpend: number;
  cac: number | null;
  arpa: number;
  annualChurnPct: number;
  cltv: number;
  cltvToCac: number | null;
}

// Premium and brokerage booked in the window, with last year's figure and the growth between them.
export interface RevenueGrowth {
  gwp: WithDeltaPct & { value: number; prior: number };
  commission: WithDeltaPct & { value: number; prior: number };
}

export interface ExecutiveKpis {
  gwp: WithDeltaPct & { value: number; prior: number };
  commission: WithDeltaPct & { value: number; prior: number; realised: number };
  avgPremiumPerAccount: WithDeltaPct & { value: number; accounts: number };
  organicGrowth: { valuePct: number | null; fromNewClientsPct: number | null; fromExistingClientsPct: number | null };
  aging: { buckets: AgingBucket[]; total: number; over60: number; over60Pct: number | null };
  series: SeriesPoint[];
  persistency: WithDeltaPts & { valuePct: number | null };
  renewal: WithDeltaPts & { expired: number; renewed: number; renewalRatePct: number | null };
  unitEconomics: UnitEconomics;
  pipeline: Pick<Pipeline, "openCount" | "openValue" | "weightedValue">;
  operating: OperatingKpis;
}

export interface OperatingKpis {
  activePolicies: number;
  activeClients: number;
  collectionRatePct: number | null;
  collectionDeltaPts: number | null;
  lapse: { cancelled: number; inForce: number; lapseRatePct: number | null; deltaPts: number | null };
  netProfitMarginPct: number | null;
  netIncome: number;
  renewalsDue: { overdue: number; urgent: number; upcoming: number; total: number };
}

export interface ProducerQuotaRow {
  id: number;
  name: string;
  commission: number;
  premium: number;
  quota: number;
  attainmentPct: number | null;
}

export interface SalesKpis {
  revenue: RevenueGrowth;
  quoteToBind: WithDeltaPts & { ratePct: number | null; quoted: number; bound: number };
  newBusinessRatio: WithDeltaPts & { valuePct: number | null; premium: number };
  policiesPerAccount: WithDeltaPct & { value: number; policies: number; clients: number };
  producers: ProducerQuotaRow[];
  pipeline: Pipeline;
}

export interface RetentionKpis {
  renewal: WithDeltaPts & { expired: number; renewed: number; renewalRatePct: number | null };
  persistency: WithDeltaPts & { valuePct: number | null };
  lapse: WithDeltaPts & { cancelled: number; inForce: number; lapseRatePct: number | null };
  churn: WithDeltaPts & { base: number; lost: number; churnPct: number | null };
  unitEconomics: UnitEconomics;
}

export interface OperationsKpis {
  endorsementTurnaround: { avgDays: number | null; medianDays: number | null; sample: number; missingRequestDate: number };
  fnol: {
    avgDays: number | null;
    medianDays: number | null;
    sample: number;
    withinTargetPct: number | null;
    targetDays: number;
    pending: number;
    oldestPendingDays: number | null;
  };
  serviceEfficiency: {
    tasksClosed: number;
    csrs: number;
    perCsr: number | null;
    overdueOpen: number;
    leaders: { name: string; closed: number }[];
  };
}

export interface ProducerDeal {
  id: number;
  name: string;
  client: string;
  stage: string;
  premium: number;
  probability: number;
  expectedClose: string | null;
}

export interface RenewalItem {
  id: number;
  client: string;
  policyNo: string | null;
  classOfBusiness: string | null;
  endDate: string;
  premium: number;
  daysLeft: number;
}

export interface TaskItem {
  id: number;
  title: string;
  dueDate: string | null;
  priority: string;
}

export interface ProducerKpis {
  producerLinked: boolean;
  revenue: RevenueGrowth;
  pipeline: Pipeline | null;
  deals: ProducerDeal[];
  speedToLead: { avgHours: number | null; medianHours: number | null; sample: number; untouched: number };
  renewals: { overdue: number; next14: number; next60: number; items: RenewalItem[] };
  tasks: { open: number; overdue: number; dueToday: number; items: TaskItem[] };
}

export interface DashboardKpiResponse {
  view: KpiView;
  allowedViews: KpiView[];
  year: number;
  window: { from: string; to: string };
  priorWindow: { from: string; to: string };
  generatedAt: string;
  cached: boolean;
  executive?: ExecutiveKpis;
  sales?: SalesKpis;
  retention?: RetentionKpis;
  operations?: OperationsKpis;
  producer?: ProducerKpis;
}

// `view` is optional: the server picks the caller's default. It never trusts a
// role from the client, so asking for a view you aren't allowed returns 403.
export function useDashboardKpis(view: KpiView | null, year: number | null) {
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (year) params.set("year", String(year));
  const qs = params.toString();
  return useQuery({
    queryKey: ["dashboard-kpis", view, year],
    queryFn: () => api.get<DashboardKpiResponse>(`/api/dashboard/kpis${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
  });
}

export function refreshDashboardKpis(view: KpiView | null, year: number | null) {
  const params = new URLSearchParams({ refresh: "1" });
  if (view) params.set("view", view);
  if (year) params.set("year", String(year));
  return api.get<DashboardKpiResponse>(`/api/dashboard/kpis?${params.toString()}`);
}

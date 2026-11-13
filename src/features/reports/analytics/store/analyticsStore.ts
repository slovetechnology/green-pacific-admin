import { create } from "zustand";

// Central state for the Analytics page. Every widget reads the same filters from here and every widget
// writes to it, which is what makes a click in one chart re-slice all the others (cross-filtering).
// The server does the slicing; the store only holds what was picked.

export type DimensionKey = "insurer_id" | "class" | "broker" | "business_type" | "status";

export const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: "insurer_id", label: "Insurer" },
  { key: "class", label: "Product line" },
  { key: "broker", label: "Broker" },
  { key: "business_type", label: "Business type" },
  { key: "status", label: "Policy status" },
];

export interface AnalyticsFilters {
  year: number | null; // null = current year to date
  from: string | null; // an explicit window (e.g. a clicked month) overrides the year
  to: string | null;
  insurer_id: number | null;
  class: string | null;
  broker: string | null;
  business_type: string | null;
  status: string | null;
}

export const EMPTY_FILTERS: AnalyticsFilters = {
  year: null,
  from: null,
  to: null,
  insurer_id: null,
  class: null,
  broker: null,
  business_type: null,
  status: null,
};

interface AnalyticsState {
  filters: AnalyticsFilters;
  setYear: (year: number | null) => void;
  setRange: (from: string | null, to: string | null) => void;
  // Picks a value, or clears it when it is already the picked one (click again to un-slice).
  toggle: (key: DimensionKey, value: string | number | null) => void;
  set: (key: DimensionKey, value: string | number | null) => void;
  clearDimensions: () => void;
  clearAll: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  filters: EMPTY_FILTERS,
  setYear: (year) => set((s) => ({ filters: { ...s.filters, year, from: null, to: null } })),
  setRange: (from, to) => set((s) => ({ filters: { ...s.filters, from, to } })),
  toggle: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: s.filters[key] === value ? null : value } })),
  set: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value === "" ? null : value } })),
  clearDimensions: () => set((s) => ({ filters: { ...EMPTY_FILTERS, year: s.filters.year, from: s.filters.from, to: s.filters.to } })),
  clearAll: () => set({ filters: EMPTY_FILTERS }),
}));

// Selector for the widgets that only care about one filter, so they don't re-render for the others.
export const useFilter = <K extends keyof AnalyticsFilters>(key: K) => useAnalyticsStore((s) => s.filters[key]);

const MONTH_END = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// "2026-03" -> the whole month, as a from/to pair.
export const monthRange = (ym: string): [string, string] => [`${ym}-01`, MONTH_END(ym)];

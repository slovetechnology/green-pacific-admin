import { memo, useCallback } from "react";
import { DIMENSIONS, EMPTY_FILTERS, useAnalyticsStore, type DimensionKey } from "../store/analyticsStore";
import type { AnalyticsAccess, AnalyticsResponse } from "../api/analytics";

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i);
const STATUS_LABEL: Record<string, string> = { active: "Active", expired: "Expired", cancelled: "Cancelled" };

type Options = AnalyticsResponse["options"] | undefined;

// A select whose list can be missing the picked value (a chart can pick "Unclassified", which is not in
// the list), so the picked value is always offered.
function Slicer({ label, value, choices, onPick }: { label: string; value: string; choices: { value: string; label: string }[]; onPick: (v: string) => void }) {
  const known = !value || choices.some((c) => c.value === value);
  return (
    <label className="exec-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">All</option>
        {!known && <option value={value}>{value}</option>}
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function choicesFor(key: DimensionKey, options: Options): { value: string; label: string }[] {
  if (!options) return [];
  switch (key) {
    case "insurer_id":
      return options.insurers.map((i) => ({ value: String(i.id), label: i.name }));
    case "class":
      return options.classes.map((c) => ({ value: c, label: c }));
    case "broker":
      return options.brokers.map((b) => ({ value: b, label: b }));
    case "business_type":
      return options.businessTypes.map((b) => ({ value: b, label: b }));
    default:
      return options.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }));
  }
}

interface Props {
  options: Options;
  access?: AnalyticsAccess;
  window?: { from: string; to: string };
  generatedAt?: string;
  cached?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

// The global slicers. Everything here reads and writes the shared store; picking a value in a chart
// lights up the matching select, and vice versa.
export const FilterBar = memo(function FilterBar({ options, access, window: win, generatedAt, cached, refreshing, onRefresh }: Props) {
  const filters = useAnalyticsStore((s) => s.filters);
  const setYear = useAnalyticsStore((s) => s.setYear);
  const setRange = useAnalyticsStore((s) => s.setRange);
  const set = useAnalyticsStore((s) => s.set);
  const clearAll = useAnalyticsStore((s) => s.clearAll);
  const pick = useCallback(
    (key: DimensionKey, v: string) => set(key, key === "insurer_id" ? (v ? Number(v) : null) : v),
    [set]
  );
  const dirty = (Object.keys(EMPTY_FILTERS) as (keyof typeof EMPTY_FILTERS)[]).some((k) => filters[k] !== EMPTY_FILTERS[k]);

  return (
    <div className="exec-filters kpi-controls an-filters" role="search" aria-label="Analytics filters">
      <label className="exec-filter">
        <span>Year</span>
        <select value={filters.from ? "" : (filters.year ?? THIS_YEAR)} onChange={(e) => setYear(e.target.value === String(THIS_YEAR) ? null : Number(e.target.value))}>
          {filters.from && <option value="">Custom range</option>}
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
              {y === THIS_YEAR ? " (year to date)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="exec-filter">
        <span>From</span>
        <input type="date" value={filters.from ?? win?.from ?? ""} max={filters.to ?? undefined} onChange={(e) => setRange(e.target.value || null, filters.to ?? win?.to ?? null)} />
      </label>
      <label className="exec-filter">
        <span>To</span>
        <input type="date" value={filters.to ?? win?.to ?? ""} min={filters.from ?? undefined} onChange={(e) => setRange(filters.from ?? win?.from ?? null, e.target.value || null)} />
      </label>
      {DIMENSIONS.map((d) =>
        d.key === "broker" && access?.lockedProducer ? (
          // A producer's own identity, not a choice: the server ignores any other broker anyway.
          <label key={d.key} className="exec-filter">
            <span>{d.label}</span>
            <select value="me" disabled aria-label="Broker (locked to you)">
              <option value="me">{access.lockedProducer}</option>
            </select>
          </label>
        ) : (
          <Slicer key={d.key} label={d.label} value={filters[d.key] === null ? "" : String(filters[d.key])} choices={choicesFor(d.key, options)} onPick={(v) => pick(d.key, v)} />
        )
      )}
      <div className="an-filter-actions">
        <span className="kpi-freshness" role="status">
          {generatedAt ? `Updated ${new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${cached ? " (cached)" : ""}` : ""}
        </span>
        {dirty && (
          <button type="button" className="exec-filter-clear" onClick={clearAll}>
            Clear filters
          </button>
        )}
        <button type="button" className="exec-filter-clear kpi-refresh" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>
    </div>
  );
});

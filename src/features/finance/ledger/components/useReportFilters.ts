import { useSearchParams } from "react-router";
import { defaultRange } from "../api/ledger";
import type { ReportFilters } from "./ReportToolbar";

/** Statement filters kept in the address (?from=&to=&currency=), so a statement can be bookmarked or shared. */
export function useReportFilters(): [ReportFilters, (next: ReportFilters) => void] {
  const [params, setParams] = useSearchParams();
  const range = defaultRange();
  const filters = {
    from: params.get("from") || range.from,
    to: params.get("to") || range.to,
    currency: params.get("currency") || "NGN",
  };
  const set = (next: ReportFilters) => setParams({ from: next.from, to: next.to, currency: next.currency }, { replace: true });
  return [filters, set];
}

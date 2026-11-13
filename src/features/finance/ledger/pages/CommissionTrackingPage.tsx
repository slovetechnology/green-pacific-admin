import "@/shared/styles/ledger.css";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { downloadReport, fmtMinor } from "../api/ledger";
import { useReportFilters } from "../components/useReportFilters";

interface Report {
  from: string;
  to: string;
  groupBy: "producer" | "insurer";
  rows: { name: string; policies: number; booked: number; collected: number; clawedBack: number; net: number }[];
  totals: { booked: number; collected: number; clawedBack: number; net: number };
}

/** Commission booked, collected and clawed back, per producer or per insurer, for a date range. */
export function CommissionTrackingPage() {
  const [filters, setFilters] = useReportFilters();
  const [params, setParams] = useSearchParams();
  const groupBy = params.get("group_by") === "insurer" ? "insurer" : "producer";
  const query = { from: filters.from, to: filters.to, group_by: groupBy };
  const { data, isLoading, error } = useQuery({
    queryKey: ["gl", "commission-tracking", query],
    queryFn: () => api.get<Report>(`/api/gl/reports/commission-tracking?${new URLSearchParams(query)}`),
  });
  const setGroup = (g: string) => {
    const next = new URLSearchParams(params);
    next.set("group_by", g);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">General Ledger</p>
          <h1>Commission Tracking</h1>
          <p className="ledger-intro">
            <strong>Booked</strong>: brokerage on policies and additional premiums transacted in the range. <strong>Collected</strong>: brokerage in
            premium receipted in the range, plus Direct Bill commission on insurer statements reconciled in it. <strong>Clawed back</strong>:
            return premiums and policies cancelled in the range. The last column is an indicator, not a balance.
          </p>
        </div>
      </div>
      <div className="card ledger-toolbar">
        <div className="toolbar">
          <label className="ledger-field"><span>From</span><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label className="ledger-field"><span>To</span><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <label className="ledger-field"><span>Per</span>
            <select value={groupBy} onChange={(e) => setGroup(e.target.value)}>
              <option value="producer">Producer (broker)</option>
              <option value="insurer">Insurer (carrier)</option>
            </select>
          </label>
          <div className="ledger-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadReport("/api/gl/reports/commission-tracking", query, "xlsx")}>Excel</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadReport("/api/gl/reports/commission-tracking", query, "csv")}>CSV</button>
          </div>
        </div>
      </div>
      {error && <div className="flash flash-error">{error instanceof ApiError ? error.message : "Could not load the report."}</div>}
      {isLoading && <p>Loading…</p>}
      {data && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-grid-table ledger-statement">
              <thead>
                <tr>
                  <th>{groupBy === "producer" ? "Producer" : "Insurer"}</th>
                  <th className="num">Policies</th>
                  <th className="num">Booked</th>
                  <th className="num">Collected</th>
                  <th className="num">Clawed back</th>
                  <th className="num">Booked less collected and clawed back</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={6} className="ledger-note">No commission activity in this range.</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="num">{r.policies}</td>
                    <td className="num">{fmtMinor(r.booked)}</td>
                    <td className="num">{fmtMinor(r.collected)}</td>
                    <td className="num">{fmtMinor(r.clawedBack)}</td>
                    <td className="num">{fmtMinor(r.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="ledger-grand-total">
                  <th colSpan={2}>Total</th>
                  <th className="num">{fmtMinor(data.totals.booked)}</th>
                  <th className="num">{fmtMinor(data.totals.collected)}</th>
                  <th className="num">{fmtMinor(data.totals.clawedBack)}</th>
                  <th className="num">{fmtMinor(data.totals.net)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

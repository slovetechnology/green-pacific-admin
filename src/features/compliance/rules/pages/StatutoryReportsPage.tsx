import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import type { CalendarEntry, CalendarResponse, RegistryResponse } from "../lib/types";

// The calendar is generated from the registry, so it always lists all 98
// obligations for the year whether or not a row exists for them. That is
// the point of the page — a missing filing has to be visible.
export function StatutoryReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const year = searchParams.get("year") || String(new Date().getFullYear());
  const frequency = searchParams.get("frequency") || "";
  const status = searchParams.get("status") || "";
  const reportType = searchParams.get("report_type") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["statutory-calendar", year],
    queryFn: () => api.get<CalendarResponse>(`/api/statutory-reports/calendar?year=${encodeURIComponent(year)}`),
  });

  const { data: registry } = useQuery({
    queryKey: ["statutory-registry"],
    queryFn: () => api.get<RegistryResponse>("/api/statutory-reports/registry"),
  });

  const startDraft = useMutation({
    mutationFn: (entry: CalendarEntry) =>
      api.post<{ reportId: number }>("/api/statutory-reports/drafts", {
        report_type: entry.reportType,
        year: Number(year),
        period: entry.period,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["statutory-calendar"] });
      navigate(`/compliance/reports/${result.reportId}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not open the draft."),
  });

  function updateParams(next: Record<string, string>) {
    setSearchParams({ year, frequency, status, report_type: reportType, ...next });
  }

  const entries = (data?.calendar || []).filter(
    (entry) =>
      (!frequency || entry.frequency === frequency) &&
      (!status || entry.status === status) &&
      (!reportType || entry.reportType === reportType)
  );

  const stats = data?.stats;
  const broker = registry?.broker;
  // Filing is refused server-side without these two, so say it here rather
  // than letting the first Submit be where staff find out.
  const brokerUnconfigured = broker && (!broker.rbcNumber || !broker.licenceExpiryDate);

  // Years either side of the current one — statutory filings run to a
  // fixed calendar, so a free-text year box would only invite typos.
  const thisYear = new Date().getFullYear();
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>NAICOM Statutory Reports</h1>
        </div>
        <div className="page-header-actions">
          <select value={year} onChange={(e) => updateParams({ year: e.target.value })}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="page-lede">
        Every return the brokerage owes NAICOM for the year, filed or not. Obligations come from the
        statutory calendar, so a report that has never been started still appears here.
      </p>

      {error && <div className="flash flash-error">{error}</div>}
      {brokerUnconfigured && (
        <div className="flash flash-error">
          The broker licence details are not configured, so no report can be filed yet. Set{" "}
          <code>BROKER_RBC_NUMBER</code> and <code>BROKER_LICENCE_EXPIRY</code> in <code>backend/.env</code>{" "}
          (see <code>backend/.env.example</code>), then restart the backend.
        </div>
      )}

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="card kpi-card">
            <div className="kpi-label">Compliance rate</div>
            <div className="kpi-value">{stats.complianceRate}%</div>
            <div className="field-hint">Of filings whose deadline has passed</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Filed</div>
            <div className="kpi-value">{stats.filed} / {stats.total}</div>
            <div className="field-hint">{stats.accepted} accepted by NAICOM</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Overdue</div>
            <div className="kpi-value" style={{ color: stats.overdue ? "var(--status-critical)" : undefined }}>
              {stats.overdue}
            </div>
            <div className="field-hint">{stats.queried} queried by NAICOM</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Due within 7 days</div>
            <div className="kpi-value" style={{ color: stats.dueSoon ? "var(--status-warning)" : undefined }}>
              {stats.dueSoon}
            </div>
            <div className="field-hint">{stats.inProgress} in progress</div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <select value={frequency} onChange={(e) => updateParams({ frequency: e.target.value })}>
          <option value="">All frequencies</option>
          {(registry?.frequencies || []).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select value={reportType} onChange={(e) => updateParams({ report_type: e.target.value })}>
          <option value="">All report types</option>
          {(registry?.registry || []).map((r) => (
            <option key={r.reportType} value={r.reportType}>
              {r.reportType} — {r.title}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="Not started">Not started</option>
          {(registry?.statuses || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Report</th>
                <th>Period</th>
                <th>Due</th>
                <th>Status</th>
                <th>NAICOM Reference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7}>Loading…</td></tr>}
              {!isLoading && entries.length === 0 && (
                <tr><td colSpan={7} className="empty-state">No obligations match these filters.</td></tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.reportCode}>
                  <td>{entry.reportCode}</td>
                  <td>
                    {entry.reportTitle}
                    {entry.autoPopulated && <span className="field-hint"> · auto-populated</span>}
                  </td>
                  <td>{entry.periodLabel}</td>
                  <td>
                    {entry.dueDate || "—"}
                    {entry.isOverdue && <> <span className="badge badge-overdue">Overdue</span></>}
                  </td>
                  <td><StatusBadge status={entry.status} /></td>
                  <td>{entry.naicomReference || "—"}</td>
                  <td>
                    {entry.reportId ? (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => navigate(`/compliance/reports/${entry.reportId}`)}
                      >
                        Open
                      </button>
                    ) : (
                      <RoleGate need="write">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={startDraft.isPending}
                          onClick={() => { setError(null); startDraft.mutate(entry); }}
                        >
                          Start draft
                        </button>
                      </RoleGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

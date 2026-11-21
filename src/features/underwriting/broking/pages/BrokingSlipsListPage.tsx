import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  fetchBrokingSlips,
  fetchBrokingSlipTemplates,
  approveBrokingSlip,
  approvePendingBrokingSlips,
  getBrokingSlipPdfUrl
} from "../api/brokingSlips";
import type { ApprovePendingResult } from "../api/brokingSlips";
import { RoleGate } from "@/app/guards/RoleGate";
import { fmtMoney } from "@/shared/lib/format";
import { confirmDialog } from "@/shared/components/Dialogs";

export function BrokingSlipsListPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const { data: templatesData } = useQuery({
    queryKey: ["brokingSlipTemplates"],
    queryFn: fetchBrokingSlipTemplates
  });

  const { data: slipsData, isLoading, isError } = useQuery({
    queryKey: ["brokingSlips", search, selectedType, selectedStatus],
    queryFn: () => fetchBrokingSlips({ search, slipType: selectedType, status: selectedStatus })
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveBrokingSlip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brokingSlips"] });
    }
  });

  const [bulkResult, setBulkResult] = useState<ApprovePendingResult | null>(null);
  const approveAllMutation = useMutation({
    mutationFn: approvePendingBrokingSlips,
    onSuccess: (result) => {
      setBulkResult(result);
      queryClient.invalidateQueries({ queryKey: ["brokingSlips"] });
    }
  });

  const items = slipsData?.items || [];
  const counts = slipsData?.statusCounts;
  const countOf = (...statuses: string[]) =>
    counts
      ? statuses.reduce((n, st) => n + (counts[st] || 0), 0)
      : items.filter(s => statuses.includes(s.status)).length;

  // Summary Metrics
  const totalSlips = slipsData?.total || 0;
  const placedCount = countOf("Placed", "Completed");
  const pendingApproval = countOf("Draft", "Under Review");
  const submittedCount = countOf("Submitted", "Quoted");

  const approveAll = async () => {
    if (!pendingApproval) return;
    const ok = await confirmDialog(`Approve all ${pendingApproval} slips that are in Draft or Under Review?\n\n` +
      "Each approval is recorded in the audit log under your name, and a policy document is issued for every slip linked to a policy. This cannot be undone in bulk.");
    if (ok) approveAllMutation.mutate();
  };

  const typeConfig = templatesData?.types || {};

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Broking Slips</h1>
          <p className="page-subtitle">
            Market Reform Contracts (MRC), Co-Insurance Placement, Facultative Reinsurance & Policy Instructions
          </p>
        </div>
        <div className="page-actions">
          <RoleGate need="admin">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={approveAll}
              disabled={!pendingApproval || approveAllMutation.isPending}
            >
              {approveAllMutation.isPending ? "Approving…" : `Approve all pending (${pendingApproval})`}
            </button>
          </RoleGate>
          <Link to="/broking-slips/new" className="btn btn-primary">
            + Create New Slip
          </Link>
        </div>
      </div>

      {approveAllMutation.isError && (
        <div className="alert alert-danger">
          {(approveAllMutation.error as Error)?.message || "Bulk approval failed."}
        </div>
      )}
      {bulkResult && (
        <div className={bulkResult.failedCount ? "alert alert-warning" : "alert alert-success"}>
          Approved {bulkResult.approvedCount} slip{bulkResult.approvedCount === 1 ? "" : "s"}.
          {" "}Policy documents: {bulkResult.documents.Generated} issued
          {bulkResult.documents.Failed ? `, ${bulkResult.documents.Failed} could not be generated` : ""}
          {bulkResult.documents.Skipped ? `, ${bulkResult.documents.Skipped} slips not linked to a policy` : ""}.
          {bulkResult.failedCount > 0 && (
            <ul>
              {bulkResult.failed.map(f => (
                <li key={f.id}>{f.slip_number}: {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Total Slips Issued</span>
          <span className="kpi-value">{totalSlips}</span>
          <span className="kpi-subtext">Across all 14 slip types</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Active Market Submissions</span>
          <span className="kpi-value">{submittedCount}</span>
          <span className="kpi-subtext">Submitted to Underwriters</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Pending Approval</span>
          <span className="kpi-value warning">{pendingApproval}</span>
          <span className="kpi-subtext">Awaiting Broker Executive Sign-off</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Placed & Bound</span>
          <span className="kpi-value success">{placedCount}</span>
          <span className="kpi-subtext">Firm Placement Bound</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card filters-card" style={{ marginBottom: "1rem" }}>
        <div className="filters-row" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search slip no, client, policy, or title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: "240px" }}>
            <select
              className="form-control"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
            >
              <option value="">All Slip Types (14 Types)</option>
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.title} ({cfg.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: "180px" }}>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {(templatesData?.statuses || ["Draft", "Under Review", "Approved", "Submitted", "Quoted", "Placed", "Cancelled"]).map(st => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Slips Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-container">Loading broking slips...</div>
        ) : isError ? (
          <div className="alert alert-danger">Error loading broking slips. Please try again.</div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem", textAlign: "center" }}>
            <h3>No Broking Slips Found</h3>
            <p>Generate Market Reform Contracts (MRC), Quotation Requests, Cover Notes, or Reinsurance Slips.</p>
            <Link to="/broking-slips/new" className="btn btn-primary" style={{ marginTop: "1rem" }}>
              + Create First Broking Slip
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Slip No</th>
                  <th>Type & Title</th>
                  <th>Client</th>
                  <th>Lead Underwriter</th>
                  <th className="num">Sum Insured</th>
                  <th className="num">Premium</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(slip => {
                  const slipCfg = typeConfig[slip.slip_type] || {};
                  return (
                    <tr key={slip.id}>
                      <td className="font-mono font-bold">
                        <Link to={`/broking-slips/${slip.id}`} style={{ color: "var(--primary-color)", textDecoration: "none" }}>
                          {slip.slip_number}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{slip.title}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {slipCfg.category || slip.slip_type}
                        </div>
                      </td>
                      <td>
                        <div>{slip.client_name || "—"}</div>
                        {slip.policy_no && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Pol: {slip.policy_no}
                          </div>
                        )}
                      </td>
                      <td>{slip.lead_insurer_name || slip.data?.insurerName || "Market Subscription"}</td>
                      <td className="num">
                        {slip.sum_insured > 0 ? fmtMoney(slip.sum_insured) : "—"}
                      </td>
                      <td className="num">
                        {slip.premium > 0 ? fmtMoney(slip.premium) : "—"}
                      </td>
                      <td>
                        <span className="badge badge-secondary">v{slip.version}</span>
                      </td>
                      <td>
                        <span className={`status-badge status-${(slip.status || "draft").toLowerCase().replace(/\s+/g, "-")}`}>
                          {slip.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="button-group" style={{ justifyContent: "flex-end" }}>
                          <Link to={`/broking-slips/${slip.id}`} className="btn btn-sm btn-outline">
                            View
                          </Link>

                          <a
                            href={getBrokingSlipPdfUrl(slip.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            title="Download / View PDF"
                          >
                            PDF
                          </a>

                          {slip.status !== "Approved" && slip.status !== "Placed" && (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => approveMutation.mutate(slip.id)}
                              disabled={approveMutation.isPending}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

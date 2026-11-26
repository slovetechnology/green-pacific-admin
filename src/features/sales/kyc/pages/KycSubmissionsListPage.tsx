import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import "@/shared/styles/executive.css";

interface KycRow {
  id: number;
  reference_no: string;
  title: string | null;
  surname: string;
  first_name: string;
  phone: string | null;
  email: string | null;
  class_of_business: string | null;
  sum_proposed: number;
  status: string;
  created_at: string;
  risk_level: string | null;
}

interface Response {
  submissions: KycRow[];
  q: string;
  status: string;
  statuses: string[];
}

// Statuses that need no further compliance action.
const DECIDED_STATUSES = ["Verified", "Approved", "Rejected", "Closed"];
const HIGH_RISK = ["high", "very high", "critical"];

// No row drawer here on purpose: opening a KYC record reveals decrypted identity
// data and is written to the audit log, so the list stays a masked index and
// the detail page remains the only place that happens.
export function KycSubmissionsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "";
  const [qInput, setQInput] = useState(q);

  const { data, isLoading } = useQuery({
    queryKey: ["kyc", q, status],
    queryFn: () => api.get<Response>(`/api/kyc?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<KycRow>[] = [
    { key: "reference", header: "Reference", render: (s) => <Link to={`/kyc-submissions/${s.id}`}>{s.reference_no}</Link> },
    { key: "name", header: "Name", render: (s) => [s.title, s.first_name, s.surname].filter(Boolean).join(" ") },
    { key: "phone", header: "Phone", render: (s) => <span className="nowrap">{s.phone || "—"}</span> },
    { key: "class", header: "Class of Business", render: (s) => s.class_of_business || "—" },
    { key: "sum_proposed", header: "Sum Proposed", align: "right", render: (s) => fmtMoney(s.sum_proposed) },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    { key: "risk", header: "Risk", render: (s) => (s.risk_level ? <StatusBadge status={s.risk_level} /> : "—") },
    { key: "submitted", header: "Submitted", render: (s) => <span className="nowrap">{(s.created_at || "").slice(0, 10)}</span> },
  ];

  // This endpoint is not paginated, so the figures cover every listed submission.
  const rows = data?.submissions ?? [];
  const awaiting = rows.filter((s) => !DECIDED_STATUSES.includes(s.status)).length;
  const highRisk = rows.filter((s) => HIGH_RISK.includes((s.risk_level || "").toLowerCase())).length;
  const proposed = rows.reduce((sum, s) => sum + (Number(s.sum_proposed) || 0), 0);
  const metrics: Metric[] = [
    { key: "total", label: q || status ? "Matching submissions" : "All submissions", value: rows.length },
    { key: "awaiting", label: "Awaiting a decision", value: awaiting, tone: awaiting ? "warn" : "neutral" },
    { key: "risk", label: "High risk", value: highRisk, tone: highRisk ? "crit" : "neutral" },
    { key: "sum", label: "Sum proposed", value: fmtMoneyShort(proposed), title: fmtMoney(proposed) },
  ];
  const activeFilters = [q, status].filter(Boolean).length;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Compliance</span>
          <h1>KYC Submissions</h1>
        </div>
        <div className="exec-header-actions">
          <RoleGate need="write">
            <Link className="btn btn-secondary btn-sm" to="/kyc-submissions/import">
              Upload KYC
            </Link>
          </RoleGate>
          <Link className="btn btn-sm" to="/kyc">
            New KYC submission
          </Link>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="KYC summary" />

      <form
        className="exec-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", qInput);
        }}
      >
        <label className="exec-search">
          <span>Search</span>
          <input type="search" placeholder="Name, reference, phone, email…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">All</option>
            {data?.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
        {activeFilters > 0 && (
          <button
            type="button"
            className="exec-filter-clear"
            onClick={() => {
              setQInput("");
              setSearchParams({});
            }}
          >
            Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
          </button>
        )}
      </form>

      <DataGrid columns={columns} rows={data?.submissions} isLoading={isLoading} getRowKey={(s) => s.id} emptyMessage="No KYC submissions found." />
    </div>
  );
}

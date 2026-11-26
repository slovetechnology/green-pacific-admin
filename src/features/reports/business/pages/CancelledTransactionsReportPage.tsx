import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ReportSearch } from "../components/ReportSearch";

interface Row {
  id: number; cancelled_on: string; client: string; policy_no: string | null; credit_note_no: string | null;
  kind: string; class_of_business: string | null; insurer: string; producer: string | null;
  premium_due: number; total_brokerage: number; premium_paid: number; reason: string; cancelled_by: string;
}
interface Breakdown { name: string; count: number; premium_due: number; total_brokerage: number }
interface Response {
  rows: Row[];
  totals: { count: number; premium_due: number; total_brokerage: number; premium_paid: number };
  byInsurer: Breakdown[];
  byClass: Breakdown[];
  insurers: { id: number; name: string }[];
  years: string[];
  months: { value: string; label: string }[];
}

// Income lost to cancellations: what each cancelled transaction was placed with (premium and commission),
// dated by when the cancellation was recorded. Cancelled rows are already left out of every income total.
export function CancelledTransactionsReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const year = searchParams.get("year") || "";
  const month = searchParams.get("month") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(year && { year }),
    ...(month && { month }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "cancelled-transactions", qs],
    queryFn: () => api.get<Response>(`/api/reports/cancelled-transactions${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "cancelled_on", header: "Cancelled On", render: (r) => r.cancelled_on || "—" },
    { key: "client", header: "Client", render: (r) => r.client },
    { key: "policy_no", header: "Policy No", render: (r) => <Link to={`/transactions/${r.id}`}>{r.policy_no || r.credit_note_no || `#${r.id}`}</Link> },
    { key: "kind", header: "Type", render: (r) => r.kind },
    { key: "class", header: "Class", render: (r) => r.class_of_business || "—" },
    { key: "insurer", header: "Insurer", render: (r) => r.insurer },
    { key: "premium_due", header: "Premium Lost", align: "right", render: (r) => fmtMoney(r.premium_due) },
    { key: "total_brokerage", header: "Commission Lost", align: "right", render: (r) => fmtMoney(r.total_brokerage) },
    { key: "premium_paid", header: "Premium Received", align: "right", render: (r) => fmtMoney(r.premium_paid) },
    { key: "reason", header: "Reason", render: (r) => r.reason },
    { key: "cancelled_by", header: "Recorded By", render: (r) => r.cancelled_by || "—" },
  ];

  const breakdownColumns = (label: string): DataGridColumn<Breakdown>[] => [
    { key: "name", header: label, render: (b) => b.name },
    { key: "count", header: "Count", align: "right", render: (b) => b.count },
    { key: "premium_due", header: "Premium Lost", align: "right", render: (b) => fmtMoney(b.premium_due) },
    { key: "total_brokerage", header: "Commission Lost", align: "right", render: (b) => fmtMoney(b.total_brokerage) },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Cancelled Transactions Report</h1>
          <p className="muted">Premium and commission lost to cancellation instructions. None of it is counted as income.</p>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/cancelled-transactions/excel${qs ? `?${qs}` : ""}`)}>
            Download Excel
          </a>
          <a className="btn" href={apiUrl(`/api/reports/cancelled-transactions/pdf${qs ? `?${qs}` : ""}`)}>
            Download PDF
          </a>
        </div>
      </div>

      <div className="toolbar">
        <ReportSearch key={q} value={q} onSearch={(v) => setFilter("q", v)} />
        <select value={insurerId} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={year} onChange={(e) => setFilter("year", e.target.value)}>
          <option value="">All years</option>
          {(data?.years || []).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setFilter("month", e.target.value)}>
          <option value="">All months</option>
          {(data?.months || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {data && (
        <div className="kpi-row">
          <div className="card kpi-card"><div className="kpi-label">Cancelled transactions</div><div className="kpi-value">{data.totals.count}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Premium lost</div><div className="kpi-value">{fmtMoney(data.totals.premium_due)}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Commission lost</div><div className="kpi-value">{fmtMoney(data.totals.total_brokerage)}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Premium received on them</div><div className="kpi-value">{fmtMoney(data.totals.premium_paid)}</div></div>
        </div>
      )}

      <DataGrid
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        getRowKey={(r) => String(r.id)}
        emptyMessage="No cancelled transactions in this period."
        footer={
          data &&
          data.rows.length > 0 && (
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={6}>TOTAL</td>
              <td className="num">{fmtMoney(data.totals.premium_due)}</td>
              <td className="num">{fmtMoney(data.totals.total_brokerage)}</td>
              <td className="num">{fmtMoney(data.totals.premium_paid)}</td>
              <td colSpan={2}></td>
            </tr>
          )
        }
      />

      {data && data.rows.length > 0 && (
        <div className="grid grid-2" style={{ marginTop: "var(--space-6)" }}>
          <div className="card">
            <div className="section-title">Commission lost by insurer</div>
            <DataGrid columns={breakdownColumns("Insurer")} rows={data.byInsurer} isLoading={false} getRowKey={(b) => b.name} />
          </div>
          <div className="card">
            <div className="section-title">Commission lost by class of business</div>
            <DataGrid columns={breakdownColumns("Class of Business")} rows={data.byClass} isLoading={false} getRowKey={(b) => b.name} />
          </div>
        </div>
      )}
    </div>
  );
}

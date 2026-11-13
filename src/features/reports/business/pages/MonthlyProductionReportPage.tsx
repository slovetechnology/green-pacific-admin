import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ReportSearch } from "../components/ReportSearch";

interface Row {
  trans_date: string; client: string; credit_note_no: string; business_type: string;
  class_of_business: string; policy_no: string; start_date: string | null; end_date: string | null;
  premium_due: number; total_brokerage: number; net_premium: number; date_of_payment: string | null;
  insurer: string; receipt_no: string | null;
}
interface Response {
  rows: Row[];
  totals: { premium_due: number; total_brokerage: number; net_premium: number };
  insurers: { id: number; name: string }[];
  years: string[];
  statuses: string[];
  months: { value: string; label: string }[];
}

export function MonthlyProductionReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const year = searchParams.get("year") || "";
  const status = searchParams.get("status") || "";
  const month = searchParams.get("month") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(year && { year }),
    ...(status && { status }),
    ...(month && { month }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "monthly-production", qs],
    queryFn: () => api.get<Response>(`/api/reports/monthly-production${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "date", header: "Date", render: (r) => r.trans_date },
    { key: "client", header: "Client", render: (r) => r.client },
    { key: "credit_note_no", header: "Credit Note", render: (r) => r.credit_note_no },
    { key: "business_type", header: "Business Type", render: (r) => r.business_type },
    { key: "class", header: "Class", render: (r) => r.class_of_business },
    { key: "policy_no", header: "Policy No", render: (r) => r.policy_no },
    { key: "premium_due", header: "Premium Due", align: "right", render: (r) => fmtMoney(r.premium_due) },
    { key: "total_brokerage", header: "Total Brokerage", align: "right", render: (r) => fmtMoney(r.total_brokerage) },
    { key: "net_premium", header: "Net Premium", align: "right", render: (r) => fmtMoney(r.net_premium) },
    { key: "insurer", header: "Insurer", render: (r) => r.insurer },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Monthly Production Report</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn-secondary btn" href={apiUrl(`/api/reports/monthly-production/excel${qs ? `?${qs}` : ""}`)}>
            Download Excel
          </a>
          <a className="btn" href={apiUrl(`/api/reports/monthly-production/pdf${qs ? `?${qs}` : ""}`)}>
            Download PDF
          </a>
        </div>
      </div>

      <div className="toolbar">
        <ReportSearch key={q} value={q} onSearch={(v) => setFilter("q", v)} />
        <select value={insurerId} onChange={(e) => setFilter("insurer_id", e.target.value)}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setFilter("year", e.target.value)}>
          <option value="">All years</option>
          {(data?.years || []).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setFilter("month", e.target.value)}>
          <option value="">All months</option>
          {(data?.months || []).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {(data?.statuses || []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        getRowKey={(r) => `${r.credit_note_no}-${r.policy_no}-${r.trans_date}`}
        emptyMessage="No transactions match this filter."
        footer={
          data &&
          data.rows.length > 0 && (
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={6}>TOTAL</td>
              <td className="num">{fmtMoney(data.totals.premium_due)}</td>
              <td className="num">{fmtMoney(data.totals.total_brokerage)}</td>
              <td className="num">{fmtMoney(data.totals.net_premium)}</td>
              <td></td>
            </tr>
          )
        }
      />
    </div>
  );
}

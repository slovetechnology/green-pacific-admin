import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ReportSearch } from "../components/ReportSearch";

interface Row {
  credit_note_no: string; client: string; class_of_business: string; policy_no: string;
  sum_insured: number; premium_paid: number; commission: number; net_premium: number;
  start_date: string | null; end_date: string | null; insurer: string; date_of_payment: string | null;
}
interface Response {
  rows: Row[];
  totals: { sum_insured: number; premium_paid: number; commission: number; net_premium: number };
  insurers: { id: number; name: string }[];
  years: string[];
  filterDesc: string;
}

export function RemittanceReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const year = searchParams.get("year") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({ ...(insurerId && { insurer_id: insurerId }), ...(year && { year }), ...(q && { q }) }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "remittance", qs],
    queryFn: () => api.get<Response>(`/api/reports/remittance${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "credit_note_no", header: "Credit Note", render: (r) => r.credit_note_no },
    { key: "client", header: "Client", render: (r) => r.client },
    { key: "class", header: "Class", render: (r) => r.class_of_business },
    { key: "policy_no", header: "Policy No", render: (r) => r.policy_no },
    { key: "sum_insured", header: "Sum Insured", align: "right", render: (r) => fmtMoney(r.sum_insured) },
    { key: "premium_paid", header: "Premium Paid", align: "right", render: (r) => fmtMoney(r.premium_paid) },
    { key: "commission", header: "Commission", align: "right", render: (r) => fmtMoney(r.commission) },
    { key: "net_premium", header: "Net Premium", align: "right", render: (r) => fmtMoney(r.net_premium) },
    { key: "insurer", header: "Insurer", render: (r) => r.insurer },
    { key: "date_paid", header: "Date Paid", render: (r) => r.date_of_payment || "—" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Remittance Report</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn" href={apiUrl(`/api/reports/remittance/pdf${qs ? `?${qs}` : ""}`)}>
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
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Status is always Paid for this report.</span>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.rows}
        isLoading={isLoading}
        getRowKey={(r) => `${r.credit_note_no}-${r.policy_no}`}
        emptyMessage="No paid transactions match this filter."
        footer={
          data &&
          data.rows.length > 0 && (
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4}>TOTAL</td>
              <td className="num">{fmtMoney(data.totals.sum_insured)}</td>
              <td className="num">{fmtMoney(data.totals.premium_paid)}</td>
              <td className="num">{fmtMoney(data.totals.commission)}</td>
              <td className="num">{fmtMoney(data.totals.net_premium)}</td>
              <td colSpan={2}></td>
            </tr>
          )
        }
      />
    </div>
  );
}

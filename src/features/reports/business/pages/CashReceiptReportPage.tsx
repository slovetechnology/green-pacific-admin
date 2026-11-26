import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ReportSearch } from "../components/ReportSearch";

interface Row {
  id: number; receipt_no: string; debit_note_no: string; client: string; class_of_business: string;
  policy_no: string; premium_paid: number; date_of_payment: string | null;
}
interface Response {
  rows: Row[];
  totals: { premium_paid: number };
  insurers: { id: number; name: string }[];
  years: string[];
  statuses: string[];
}

export function CashReceiptReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const year = searchParams.get("year") || "";
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(year && { year }),
    ...(status && { status }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "cash-receipt", qs],
    queryFn: () => api.get<Response>(`/api/reports/cash-receipt${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "receipt_no", header: "Receipt No", render: (r) => r.receipt_no },
    { key: "debit_note_no", header: "Debit Note No", render: (r) => r.debit_note_no || "—" },
    { key: "client", header: "Client", render: (r) => r.client },
    { key: "class", header: "Class", render: (r) => r.class_of_business },
    { key: "policy_no", header: "Policy No", render: (r) => r.policy_no },
    { key: "premium_paid", header: "Premium Paid", align: "right", render: (r) => fmtMoney(r.premium_paid) },
    { key: "date_paid", header: "Date Paid", render: (r) => r.date_of_payment || "—" },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <a className="btn btn-sm" href={apiUrl(`/api/reports/cash-receipt/${r.id}/pdf`)}>
          PDF
        </a>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Cash Receipt Report</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn" href={apiUrl(`/api/reports/cash-receipt/pdf${qs ? `?${qs}` : ""}`)}>
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
        getRowKey={(r) => r.id}
        emptyMessage="No receipts match this filter."
        footer={
          data &&
          data.rows.length > 0 && (
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={5}>TOTAL</td>
              <td className="num">{fmtMoney(data.totals.premium_paid)}</td>
              <td></td>
              <td></td>
            </tr>
          )
        }
      />
    </div>
  );
}

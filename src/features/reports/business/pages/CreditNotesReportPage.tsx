import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface Row {
  id: number; credit_note_no: string; trans_date: string; client: string;
  class_of_business: string; policy_no: string; insurer: string; net_premium: number;
}
interface Response {
  rows: Row[];
  insurers: { id: number; name: string }[];
  years: string[];
  statuses: string[];
}

export function CreditNotesReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const insurerId = searchParams.get("insurer_id") || "";
  const year = searchParams.get("year") || "";
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const [qInput, setQInput] = useState(q);
  const qs = new URLSearchParams({
    ...(insurerId && { insurer_id: insurerId }),
    ...(year && { year }),
    ...(status && { status }),
    ...(q && { q }),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "credit-notes", qs],
    queryFn: () => api.get<Response>(`/api/reports/credit-notes${qs ? `?${qs}` : ""}`),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<Row>[] = [
    { key: "credit_note_no", header: "Credit Note", render: (r) => r.credit_note_no },
    { key: "date", header: "Date", render: (r) => r.trans_date },
    { key: "client", header: "Client", render: (r) => r.client },
    { key: "class", header: "Class", render: (r) => r.class_of_business },
    { key: "policy_no", header: "Policy No", render: (r) => r.policy_no },
    { key: "insurer", header: "Insurer", render: (r) => r.insurer },
    { key: "net_premium", header: "Net Premium", align: "right", render: (r) => fmtMoney(r.net_premium) },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/transactions/${r.id}/credit-note.pdf`)}>
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
          <h1>Credit Notes</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn" href={apiUrl(`/api/reports/credit-notes/pdf${qs ? `?${qs}` : ""}`)}>
            Download All as PDF
          </a>
        </div>
      </div>

      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter("q", qInput);
          }}
          style={{ display: "flex", gap: "0.5rem" }}
        >
          <input type="search" placeholder="Search…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button type="submit" className="btn-secondary btn">
            Search
          </button>
        </form>
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
        emptyMessage="No transactions match this filter."
      />
    </div>
  );
}

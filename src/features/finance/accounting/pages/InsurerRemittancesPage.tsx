import { Link, useNavigate, useSearchParams } from "react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface RemittanceRow {
  id: number;
  insurer_id: number;
  insurer_name: string;
  period_start: string;
  period_end: string;
  gross_premium: number;
  commission: number;
  net_premium: number;
  status: string;
  remitted_date: string | null;
  reference_no: string | null;
  client_name: string | null;
  credit_note_no: string | null;
}

interface SummaryBucket {
  n: number;
  gross_premium: number;
  commission: number;
  net_premium: number;
}

interface Response {
  remittances: RemittanceRow[];
  summary: { awaiting: SummaryBucket; recorded: SummaryBucket };
  years: string[];
  insurerId: number | null;
  status: string;
  year: string;
  insurers: { id: number; name: string }[];
  statuses: string[];
}

export function InsurerRemittancesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const insurerId = searchParams.get("insurer_id") || "";
  const status = searchParams.get("status") || "";
  const year = searchParams.get("year") || "";
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["insurer-remittances", insurerId, status, year],
    queryFn: () =>
      api.get<Response>(
        `/api/insurer-remittances?insurer_id=${encodeURIComponent(insurerId)}&status=${encodeURIComponent(status)}&year=${encodeURIComponent(year)}`
      ),
  });
  const search = useRowSearch(data?.remittances, (r) => [r.insurer_name, r.reference_no, r.client_name, r.credit_note_no, r.status]);

  function updateParams(next: Record<string, string>) {
    setSearchParams({ insurer_id: insurerId, status, year, ...next });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<{ imported: number; errors: string[] }>("/api/insurer-remittances/upload", form);
      await queryClient.invalidateQueries({ queryKey: ["insurer-remittances"] });
      setUploadMessage(`Imported ${result.imported} row(s).${result.errors.length ? ` ${result.errors.length} row(s) need review.` : ""}`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const columns: DataGridColumn<RemittanceRow>[] = [
    { key: "period_start", header: "Period Start", render: (r) => r.period_start },
    { key: "period_end", header: "Period End", render: (r) => r.period_end },
    { key: "insurer", header: "Insurer", render: (r) => r.insurer_name },
    { key: "client", header: "Client", render: (r) => r.client_name || "—" },
    { key: "credit_note", header: "Credit Note Number", render: (r) => r.credit_note_no || "—" },
    { key: "gross_premium", header: "Gross Premium", align: "right", render: (r) => fmtMoney(r.gross_premium) },
    { key: "commission", header: "Commission", align: "right", render: (r) => fmtMoney(r.commission) },
    { key: "net_premium", header: "Net Premium", align: "right", render: (r) => fmtMoney(r.net_premium) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "remitted_date", header: "Remitted Date", render: (r) => r.remitted_date || "—" },
    { key: "reference", header: "Reference", render: (r) => r.reference_no || "—" },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <RoleGate need="write">
          <Link to={`/insurer-remittances/${r.id}/edit`} className="btn-secondary btn-sm">
            Edit
          </Link>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Financials</p>
          <h1>Insurer Remittances</h1>
        </div>        <div className="page-header-actions">
          <RoleGate need="write">
            <input ref={uploadRef} type="file" accept=".xlsx" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleUpload(file); }} />
            <button type="button" className="btn-secondary btn" disabled={uploading} onClick={() => uploadRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload Remittances"}
            </button>
            <button type="button" className="btn" onClick={() => navigate("/insurer-remittances/new")}>
              + Log Remittance
            </button>
          </RoleGate>
        </div>
      </div>
      <p className="page-lede">Track premium owed to, and paid over to, each insurer — separate from client receivables.</p>
      {uploadMessage && <div className="flash flash-info">{uploadMessage}</div>}

      {data && (
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="card kpi-card">
            <div className="kpi-label">Awaiting remittance ({data.summary.awaiting.n})</div>
            <div className="kpi-value">{fmtMoney(data.summary.awaiting.net_premium)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Recorded / remitted ({data.summary.recorded.n})</div>
            <div className="kpi-value">{fmtMoney(data.summary.recorded.net_premium)}</div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <select value={insurerId} onChange={(e) => updateParams({ insurer_id: e.target.value })}>
          <option value="">All insurers</option>
          {(data?.insurers || []).map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(data?.statuses || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => updateParams({ year: e.target.value })}>
          <option value="">All years</option>
          {(data?.years || []).filter((y) => /^\d{4}$/.test(y)).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Insurer, reference, client or credit note…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        emptyMessage="No remittances logged yet."
      />
    </div>
  );
}

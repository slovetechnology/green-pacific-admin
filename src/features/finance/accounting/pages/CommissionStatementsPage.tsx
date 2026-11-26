import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import type { StatementDetail, StatementListRow } from "../lib/commissionStatements";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

// Insurer commission statements (backend: lib/commissionStatements.js).
export function CommissionStatementsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["commission-statements"],
    queryFn: () => api.get<{ statements: StatementListRow[]; insurers: { id: number; name: string }[] }>("/api/commission-statements"),
  });
  const search = useRowSearch(data?.statements, (s) => [s.insurer_name, s.statement_ref, s.file_name, s.deposit_reference, s.status]);
  const [insurerId, setInsurerId] = useState("");
  const [statementRef, setStatementRef] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!insurerId || !file) {
      setError("Choose the insurer and the statement file.");
      return;
    }
    const form = new FormData();
    form.set("insurer_id", insurerId);
    form.set("statement_ref", statementRef);
    form.set("period_start", periodStart);
    form.set("period_end", periodEnd);
    form.set("file", file);
    setUploading(true);
    try {
      const detail = await api.upload<StatementDetail>("/api/commission-statements", form);
      navigate(`/commission-statements/${detail.statement.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const columns: DataGridColumn<StatementListRow>[] = [
    {
      key: "ref",
      header: "Statement",
      render: (s) => <Link to={`/commission-statements/${s.id}`}>{s.statement_ref || s.file_name || `#${s.id}`}</Link>,
    },
    { key: "insurer", header: "Insurer", render: (s) => s.insurer_name },
    { key: "period", header: "Period", render: (s) => (s.period_start ? `${s.period_start} → ${s.period_end}` : "—") },
    { key: "lines", header: "Lines", render: (s) => s.line_count },
    { key: "total", header: "Statement total", render: (s) => fmtMoney(s.statement_total) },
    { key: "deposit", header: "Deposit", render: (s) => (s.deposit_amount === null ? "—" : fmtMoney(s.deposit_amount)) },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Commission Statements</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Import an insurer's commission statement, match each line to our policies, and reconcile it against what our books
            expect and the bank deposit actually received. Mainly for Direct Bill business, where commission is the only money
            we receive.
          </p>
        </div>
      </div>

      <RoleGate need="write">
        <div className="card">
          <h2>Import a statement</h2>
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleUpload} className="form-grid">
            <div className="field">
              <label htmlFor="cs-insurer">Insurer</label>
              <select id="cs-insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
                <option value="">Select insurer…</option>
                {(data?.insurers ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cs-ref">Statement reference</label>
              <input id="cs-ref" value={statementRef} onChange={(e) => setStatementRef(e.target.value)} placeholder="Stops it being imported twice" />
            </div>
            <div className="field">
              <label htmlFor="cs-start">Period from</label>
              <input id="cs-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cs-end">Period to</label>
              <input id="cs-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cs-file">File (.csv or .xlsx)</label>
              <input id="cs-file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
            <div className="field" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="btn" disabled={uploading}>
                {uploading ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
          <p>
            Needs a policy number column and a commission column; premium and insured name help matching. Column names like
            "Policy Number" or "Brokerage" are recognised. <a href={apiUrl("/api/commission-statements/template.csv")}>Download a template</a>.
            The period helps pick the right policy when a number was reused on renewal.
          </p>
        </div>
      </RoleGate>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Insurer, statement ref, file or deposit ref…" shown={search.shown} total={search.total} />
      <DataGrid columns={columns} rows={search.filtered} isLoading={isLoading} getRowKey={(s) => s.id} emptyMessage="No statements imported yet." />
    </div>
  );
}

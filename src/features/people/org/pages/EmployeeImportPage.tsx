import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiUpload, ApiError, apiUrl } from "@/shared/api/client";

interface RowError {
  row: number | null;
  error: string;
}

// Unlike the transaction import, this one is all or nothing: one bad row
// rejects the file, so the org chart is never half-loaded.
export function EmployeeImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel (.xlsx) file to upload.");
      return;
    }
    setError(null);
    setRowErrors([]);
    setResult(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      setResult(await apiUpload<{ created: number; updated: number }>("/api/org/employees/import", form));
      await queryClient.invalidateQueries({ queryKey: ["org"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      if (err instanceof ApiError && Array.isArray(err.data?.errors)) setRowErrors(err.data.errors as RowError[]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Import employees</h1>
        <div className="page-header-actions">
          <Link to="/org/employees" className="btn-secondary btn-sm">Back to Employees</Link>
        </div>
      </div>

      {result && (
        <div className="flash flash-success">
          Imported: {result.created} added and {result.updated} updated. <Link to="/org/employees">View employees</Link>
        </div>
      )}

      <div className="card">
        <h2>1. Download the template</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          One row per person. Staff No, Full Name and Department are required. Give each person's line manager by
          their <strong>staff number</strong>; the manager can be anywhere in the file. Rows whose staff number
          already exists update that employee, and blank cells leave the current value alone. The template's Notes
          sheet explains each column.
        </p>
        <a className="btn-secondary btn-sm" href={apiUrl("/api/org/employees/import-template")}>Download .xlsx template</a>
      </div>

      <div className="card">
        <h2>2. Upload your file</h2>
        {error && <div className="flash flash-error">{error}</div>}
        {rowErrors.length > 0 && (
          <ul>
            {rowErrors.map((r, i) => (
              <li key={i}>{r.row ? `Row ${r.row}: ` : ""}{r.error}</li>
            ))}
          </ul>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="file">Excel file (.xlsx)</label>
            <input id="file" type="file" accept=".xlsx" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Importing…" : "Upload & import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

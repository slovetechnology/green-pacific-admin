import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError, apiUrl } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";

interface Field {
  label: string;
  key: string;
  required: boolean;
  hint: string;
}

export interface ImportResultBase {
  imported: number;
  errors: string[];
}

interface Props<R extends ImportResultBase> {
  /** e.g. "/api/claims-import": serves /fields, /template and the POST upload. */
  endpoint: string;
  title: string;
  /** Plural noun for counts, e.g. "claims". */
  noun: string;
  backTo: string;
  backLabel: string;
  /** TanStack Query key prefix to refresh after an upload. */
  invalidate: string;
  intro: ReactNode;
  /** Extra summary cells and cards on the results screen. */
  summary?: (result: R) => ReactNode;
  details?: (result: R) => ReactNode;
}

const muted = { color: "var(--text-muted)", fontSize: "0.85rem" } as const;
const plural = (n: number, word: string) => `${n} ${n === 1 ? word.replace(/s$/, "") : word}`;

export function SpreadsheetImport<R extends ImportResultBase>(props: Props<R>) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<R | null>(null);

  const { data } = useQuery({
    queryKey: [props.endpoint, "fields"],
    queryFn: () => api.get<{ fields: Field[] }>(`${props.endpoint}/fields`),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel (.xlsx) file to upload.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      setResult(await apiUpload<R>(props.endpoint, form));
      await queryClient.invalidateQueries({ queryKey: [props.invalidate] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div>
        <div className="page-header">
          <h1>Upload Results</h1>
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setResult(null); setFile(null); }}>
              Upload another file
            </button>
            <Link to={props.backTo} className="btn">{props.backLabel}</Link>
          </div>
        </div>

        <div className="card">
          <div className="detail-grid">
            <div>
              <div className="k">Imported</div>
              <div className="v"><span className="badge badge-paid">{plural(result.imported, props.noun)}</span></div>
            </div>
            {props.summary?.(result)}
            <div>
              <div className="k">Skipped</div>
              <div className="v"><span className={`badge ${result.errors.length ? "badge-unpaid" : "badge-paid"}`}>{plural(result.errors.length, "rows")}</span></div>
            </div>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div className="card">
            <h2>Rows that were skipped</h2>
            <p style={muted}>
              Correct these rows and upload a file with just them. Rows already imported are recognised and won't be added twice.
            </p>
            <ul>
              {result.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {props.details?.(result)}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{props.title}</h1>
        <div className="page-header-actions">
          <Link to={props.backTo} className="btn-secondary btn-sm">Back</Link>
        </div>
      </div>

      <div className="card">
        <h2>1. Download the template</h2>
        <p style={muted}>{props.intro}</p>
        <a className="btn-secondary btn-sm" href={apiUrl(`${props.endpoint}/template`)}>
          Download .xlsx template
        </a>
      </div>

      <div className="card">
        <h2>2. Upload your file</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="file">Excel file (.xlsx)</label>
            <input id="file" type="file" accept=".xlsx" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Uploading…" : "Upload & import"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Column reference</h2>
        <DataGrid<Field>
          columns={[
            { key: "column", header: "Column", render: (f) => f.label },
            { key: "required", header: "Required", render: (f) => (f.required ? "Yes" : "—") },
            { key: "hint", header: "Notes", render: (f) => f.hint || "—" },
          ]}
          rows={data?.fields}
          isLoading={false}
          getRowKey={(f) => f.key}
        />
      </div>
    </div>
  );
}

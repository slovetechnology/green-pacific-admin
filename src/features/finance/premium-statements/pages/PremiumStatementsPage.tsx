import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, apiUpload, openApiFile } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import { kobo, type Preview, type StatementDetail, type StatementRow } from "../lib/premiumStatements";

/**
 * Insurer premium statements: upload a statement in whatever layout the insurer uses, check the columns the
 * importer picked (remembered per insurer afterwards), and import. Each line is matched to our policy and every
 * difference goes to the reconciliation exceptions ledger.
 */
export function PremiumStatementsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["premium-statements"],
    queryFn: () => api.get<{ statements: StatementRow[]; insurers: { id: number; name: string }[]; layouts: { key: string; label: string }[] }>("/api/premium-statements"),
  });
  const search = useRowSearch(data?.statements, (s) => [s.insurer_name, s.statement_ref, s.file_name, s.status]);
  const [insurerId, setInsurerId] = useState("");
  const [ref, setRef] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statementDate, setStatementDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [layout, setLayout] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; details?: string[] } | null>(null);

  function form(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("file", file as File);
    fd.set("insurer_id", insurerId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  async function runPreview(nextLayout?: string) {
    setError(null);
    if (!insurerId || !file) return setError({ text: "Choose the insurer and the statement file." });
    setBusy(true);
    try {
      const p = await apiUpload<Preview>("/api/premium-statements/preview", form(nextLayout ? { layout: nextLayout } : {}));
      setPreview(p);
      setLayout(p.layout);
      setHeaderRow(p.headerRow);
      setMapping(p.mapping);
    } catch (err) {
      setPreview(null);
      setError({ text: err instanceof ApiError ? err.message : "Could not read the file." });
    } finally {
      setBusy(false);
    }
  }

  async function runImport(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const detail = await apiUpload<StatementDetail>("/api/premium-statements", form({
        statement_ref: ref, period_start: periodStart, period_end: periodEnd, statement_date: statementDate, layout,
        mapping: JSON.stringify({ headerRow, columns: mapping }),
      }));
      navigate(`/premium-statements/${detail.statement.id}`);
    } catch (err) {
      const details = err instanceof ApiError ? (err.data?.details as string[] | undefined) : undefined;
      setError({ text: err instanceof ApiError ? err.message : "Import failed.", details });
    } finally {
      setBusy(false);
    }
  }

  const resetPreview = () => setPreview(null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Premium Statements</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "75ch" }}>
            Import an insurer's statement of premiums (Leadway, AIICO, Custodian or any other) and compare each policy's gross premium,
            commission and net premium with our books. Every difference, and every policy of ours in the period the statement leaves
            out, goes to the <Link to="/premium-statements/exceptions">reconciliation exceptions</Link> list until it is resolved or waived.
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/premium-statements/exceptions" className="btn btn-secondary">Exceptions</Link>
        </div>
      </div>

      <RoleGate need="write">
        <div className="card">
          <h2>Import a statement</h2>
          {error && (
            <div className="flash flash-error">
              {error.text}
              {error.details && <ul>{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ps-insurer">Insurer</label>
              <select id="ps-insurer" value={insurerId} onChange={(e) => { setInsurerId(e.target.value); resetPreview(); }}>
                <option value="">Select insurer…</option>
                {(data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ps-ref">Statement reference</label>
              <input id="ps-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Stops it being imported twice" />
            </div>
            <div className="field">
              <label htmlFor="ps-from">Period from</label>
              <input id="ps-from" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ps-to">Period to</label>
              <input id="ps-to" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ps-date">Statement date</label>
              <input id="ps-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ps-file">File (.csv or .xlsx)</label>
              <input id="ps-file" type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); resetPreview(); }} />
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            With a period, our policies with that insurer transacted in it but missing from the statement are listed too.{" "}
            <button type="button" className="btn-link" onClick={() => void openApiFile("/api/premium-statements/template.csv")}>Download a template</button>.
          </p>
          {!preview && <button type="button" className="btn" disabled={busy} onClick={() => runPreview()}>{busy ? "Reading…" : "Check columns"}</button>}

          {preview && (
            <form onSubmit={runImport}>
              <h3>Columns</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {preview.source === "remembered" ? `Using the columns remembered from ${preview.insurer.name}'s last statement.` : "Columns picked from the header names. Change any that are wrong; they are remembered for this insurer."}
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ps-layout">Layout</label>
                  <select id="ps-layout" value={layout} onChange={(e) => { setLayout(e.target.value); void runPreview(e.target.value); }}>
                    {preview.layouts.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ps-header">Header row</label>
                  <input id="ps-header" type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value) || 1)} />
                </div>
                {preview.fields.map((f) => (
                  <div className="field" key={f.key}>
                    <label htmlFor={`ps-col-${f.key}`}>{f.label}{f.required ? " *" : ""}</label>
                    <select id={`ps-col-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) || 0 })}>
                      <option value="">Not on the statement</option>
                      {preview.headers.map((h) => <option key={h.col} value={h.col}>{h.text}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p>{preview.lineCount} line{preview.lineCount === 1 ? "" : "s"} read{preview.errorCount ? `, ${preview.errorCount} with problems` : ""}. First lines:</p>
              {preview.errors.length > 0 && <div className="flash flash-error"><ul>{preview.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul></div>}
              <div className="table-wrap">
                <table className="data-grid-table">
                  <thead><tr><th>Row</th><th>Policy</th><th>Insured</th><th>Debit note</th><th className="num">Gross</th><th className="num">Commission</th><th className="num">Net</th></tr></thead>
                  <tbody>
                    {preview.sample.map((l) => (
                      <tr key={l.rowNo}><td>{l.rowNo}</td><td>{l.policyNo}</td><td>{l.insured}</td><td>{l.debitNote}</td><td className="num">{kobo(l.gross)}</td><td className="num">{kobo(l.commission)}</td><td className="num">{kobo(l.net)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="toolbar">
                <button type="submit" className="btn" disabled={busy || !mapping.policyNo}>{busy ? "Importing…" : "Import and match"}</button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => runPreview(layout)}>Re-read with this layout</button>
                <button type="button" className="btn btn-secondary" onClick={resetPreview}>Start again</button>
              </div>
            </form>
          )}
        </div>
      </RoleGate>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Insurer, statement ref, file or status…" shown={search.shown} total={search.total} />
      <div className="card">
        {isLoading ? <p>Loading…</p> : (
          <div className="table-wrap">
            <table className="data-grid-table">
              <thead><tr><th>Statement</th><th>Insurer</th><th>Period</th><th className="num">Lines</th><th className="num">Gross</th><th className="num">Net</th><th>Open exceptions</th><th>Status</th></tr></thead>
              <tbody>
                {(search.filtered ?? []).length === 0 && <tr><td colSpan={8} style={{ color: "var(--text-muted)" }}>No statements imported yet.</td></tr>}
                {(search.filtered ?? []).map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/premium-statements/${s.id}`}>{s.statement_ref || s.file_name || `#${s.id}`}</Link></td>
                    <td>{s.insurer_name}</td>
                    <td>{s.period_start ? `${s.period_start} → ${s.period_end}` : "—"}</td>
                    <td className="num">{s.line_count}</td>
                    <td className="num">{kobo(s.gross_cents)}</td>
                    <td className="num">{kobo(s.net_cents)}</td>
                    <td>{s.status === "Open" ? (s.open_exceptions ? <span className="badge badge-unpaid">{s.open_exceptions}</span> : <span className="badge badge-paid">None</span>) : ""}</td>
                    <td><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

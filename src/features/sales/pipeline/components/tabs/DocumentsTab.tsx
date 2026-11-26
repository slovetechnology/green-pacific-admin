import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, apiUrl, documentTooLarge } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { describeError } from "../../lib/types";
import { isClosed, type TabProps } from "./shared";

export function DocumentsTab({ detail, canWrite, isAdmin, refresh }: TabProps) {
  const { deal } = detail;
  // The deal document types an admin manages on Admin > Document Types, in their order.
  const types = detail.docTypes;
  const [docType, setDocType] = useState(types.includes("Proposal") ? "Proposal" : types[0] ?? "");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpload = canWrite && !deal.archived_at;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    const tooLarge = documentTooLarge(file);
    if (tooLarge) return setError(tooLarge);
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("doc_type", docType);
      fd.append("title", title);
      fd.append("file", file);
      await api.upload(`/api/deals/${deal.id}/documents`, fd);
      setTitle("");
      setFile(null);
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="tabpanel" id="deal-panel-documents" aria-labelledby="deal-tab-documents" tabIndex={0} className="exec-tabpanel">
      <Panel title={`Documents (${detail.documents.length})`} flush>
        {detail.documents.length === 0 ? (
          <p className="exec-state">No documents yet.</p>
        ) : (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead><tr><th>Type</th><th>Title</th><th>Uploaded</th><th>By</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {detail.documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.doc_type}</td>
                    <td className="wrap">{d.title || d.doc_type}</td>
                    <td className="nowrap">{d.uploaded_at.slice(0, 10)}</td>
                    <td>{d.uploaded_by || "—"}</td>
                    <td className="num"><a href={apiUrl(`/api/documents/${d.id}/file`)} target="_blank" rel="noreferrer">Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canUpload && (
        <Panel eyebrow="Add" title="Upload a document">
          <form onSubmit={submit}>
            <div className="pl-inline-form">
              <div className="field"><label htmlFor="dc-type">Type</label>
                <select id="dc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                {isAdmin && <small>Type missing? <Link to="/document-types?area=deal">Manage deal document types</Link></small>}</div>
              <div className="field"><label htmlFor="dc-title">Title (optional)</label><input id="dc-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="field"><label htmlFor="dc-file">File (PDF, PNG or JPG, up to 10 MB)</label><input id="dc-file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            </div>
            <p className="pl-hint">A “Signed Application” here counts as the client's acceptance when the deal is won. {isClosed(detail) ? "" : "A “Proposal” counts as the proposal being sent."}</p>
            {error && <div className="flash flash-error">{error}</div>}
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
          </form>
        </Panel>
      )}
    </div>
  );
}

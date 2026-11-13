import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, apiUrl } from "@/shared/api/client";
import { errorText, type AttachmentGroup } from "../lib/reinsurance";
import "@/shared/styles/reinsurance.css";

const CATEGORIES = ["Exposure data", "Loss records", "Survey report", "Signed slip", "Wording", "Correspondence", "Other"];
const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Exposure data, loss records, survey reports, signed slips and wordings for a
// placement, treaty or party. Uploading under an existing name adds a version;
// nothing is overwritten or deleted. Files are checked on the server (type,
// content and malware scan) and a refusal says why.
export function AttachmentsPanel({ ownerType, ownerId, canUpload }: { ownerType: "placement" | "treaty" | "party"; ownerId: number; canUpload: boolean }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("Exposure data");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["ri", "attachments", ownerType, ownerId],
    queryFn: () => api.get<{ attachments: AttachmentGroup[] }>(`/api/reinsurance/attachments/${ownerType}/${ownerId}`),
  });
  const meta = useQuery({ queryKey: ["ri", "treaty-meta"], queryFn: () => api.get<{ attachmentExtensions: string[] }>("/api/reinsurance/treaty-meta") });

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file first.");
    setBusy(true); setError(null); setOk(null);
    try {
      const form = new FormData();
      form.set("category", category);
      if (name.trim()) form.set("name", name.trim());
      if (note.trim()) form.set("note", note.trim());
      form.set("file", file);
      const res = await api.upload<{ attachment: { name: string; version: number } }>(`/api/reinsurance/attachments/${ownerType}/${ownerId}`, form);
      setOk(`Uploaded ${res.attachment.name} as version ${res.attachment.version}.`);
      setName(""); setNote("");
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["ri", "attachments", ownerType, ownerId] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Attachments</h2>
      {error && <div className="flash flash-error">{error}</div>}
      {ok && <div className="flash flash-success">{ok}</div>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Name</th><th>Category</th><th>Versions</th></tr></thead>
        <tbody>
          {!list.data?.attachments.length && <tr><td colSpan={3}>{list.isLoading ? "Loading…" : "Nothing attached yet."}</td></tr>}
          {(list.data?.attachments ?? []).map((g) => (
            <tr key={g.name}>
              <td><strong>{g.name}</strong></td><td>{g.category}</td>
              <td>{g.versions.map((a) => (
                <div key={a.id}>
                  <a href={apiUrl(`/api/reinsurance/attachments/file/${a.id}`)}>v{a.version}</a>{" "}
                  <span className="ri-note">{a.original_name} · {size(a.size_bytes)} · {a.uploaded_by}, {a.uploaded_at?.slice(0, 16)}{a.note ? ` · ${a.note}` : ""}</span>
                </div>
              ))}</td>
            </tr>
          ))}
        </tbody></table></div>
      {canUpload && (
        <div className="ri-inline">
          <div className="field"><label htmlFor={`att-file-${ownerType}`}>File</label><input id={`att-file-${ownerType}`} type="file" ref={fileRef} accept={(meta.data?.attachmentExtensions ?? []).join(",")} /></div>
          <div className="field"><label htmlFor={`att-cat-${ownerType}`}>Category</label>
            <select id={`att-cat-${ownerType}`} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor={`att-name-${ownerType}`}>Name (same name = new version)</label><input id={`att-name-${ownerType}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" /></div>
          <div className="field"><label htmlFor={`att-note-${ownerType}`}>Note</label><input id={`att-note-${ownerType}`} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={upload}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
      )}
      <p className="ri-note">Accepted: {(meta.data?.attachmentExtensions ?? []).join(", ")}. Earlier versions are kept and can't be changed or deleted.</p>
    </div>
  );
}

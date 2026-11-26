import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface InsurerOption {
  id: number;
  name: string;
  insurer_ref: string | null;
}

interface InsurerSummary {
  id: number;
  name: string;
  insurer_ref: string | null;
  licence_no: string | null;
  insurer_class: string | null;
  quote_email: string | null;
  address: string | null;
}

interface MergePreview {
  keep: InsurerSummary;
  drop: InsurerSummary;
  moves: { label: string; count: number }[];
  fills: { field: string; value: string | number }[];
  blockers: string[];
}

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  quote_email: "Quote email",
  licence_no: "Licence No.",
  insurer_class: "Class",
  security_approved: "Security approved",
};

const label = (i: { name: string; insurer_ref: string | null }) => (i.insurer_ref ? `${i.insurer_ref} · ${i.name}` : i.name);

/** Admin: merge a duplicate insurer into the one kept (its records move over, then it is deleted). */
export function InsurerMergePage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [keepId, setKeepId] = useState(searchParams.get("keep") || "");
  const [dropId, setDropId] = useState(searchParams.get("drop") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const options = useQuery({ queryKey: ["insurers", "options"], queryFn: () => api.get<{ insurers: InsurerOption[] }>("/api/insurers/options") });
  const ready = keepId !== "" && dropId !== "" && keepId !== dropId;
  const preview = useQuery({
    queryKey: ["insurers", "merge-preview", keepId, dropId],
    queryFn: () => api.get<MergePreview>(`/api/insurers/merge?keep_id=${keepId}&drop_id=${dropId}`),
    enabled: ready,
  });

  const insurers = [...(options.data?.insurers ?? [])].sort((a, b) => (a.insurer_ref || "").localeCompare(b.insurer_ref || "") || a.name.localeCompare(b.name));
  const p = preview.data;

  async function merge() {
    if (!p) return;
    if (!window.confirm(`Move everything from ${label(p.drop)} to ${label(p.keep)} and delete ${label(p.drop)}? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post("/api/insurers/merge", { keep_id: Number(keepId), drop_id: Number(dropId) });
      setDone(`${label(p.drop)} was merged into ${label(p.keep)} and deleted.`);
      setDropId("");
      await queryClient.invalidateQueries({ queryKey: ["insurers"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not merge the insurers.");
    } finally {
      setBusy(false);
    }
  }

  const picker = (id: string, value: string, set: (v: string) => void, other: string) => (
    <select id={id} value={value} onChange={(e) => { set(e.target.value); setDone(null); setError(null); }}>
      <option value="">Choose an insurer…</option>
      {insurers.map((i) => (
        <option key={i.id} value={String(i.id)} disabled={String(i.id) === other}>{label(i)}</option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/insurers">Insurers</Link></p>
          <h1>Merge insurers</h1>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", maxWidth: "48rem" }}>
            For an insurer entered twice. Everything recorded against the duplicate (policies, quotes, slips, statements, remittances and the
            rest) moves to the insurer you keep, any details the kept insurer is missing are copied from the duplicate, and the duplicate is
            deleted. The kept insurer's name and reference don't change.
          </p>
        </div>
      </div>

      {done && <div className="flash flash-success">{done}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="merge-keep">Insurer to keep</label>
            {picker("merge-keep", keepId, setKeepId, dropId)}
          </div>
          <div className="field">
            <label htmlFor="merge-drop">Duplicate to merge and delete</label>
            {picker("merge-drop", dropId, setDropId, keepId)}
          </div>
        </div>
      </div>

      {ready && (
        <div className="card">
          {preview.isLoading && <p>Checking…</p>}
          {preview.isError && <div className="flash flash-error">{preview.error instanceof ApiError ? preview.error.message : "Could not check these insurers."}</div>}
          {p && (
            <>
              <h2 style={{ marginTop: 0 }}>What will happen</h2>
              {p.moves.length === 0 ? (
                <p>{label(p.drop)} has no records; it will just be deleted.</p>
              ) : (
                <>
                  <p>Moves from {label(p.drop)} to {label(p.keep)}:</p>
                  <ul>
                    {p.moves.map((m) => <li key={m.label}>{m.label}: {m.count.toLocaleString()}</li>)}
                  </ul>
                </>
              )}
              {p.fills.length > 0 && (
                <>
                  <p>Copied to {label(p.keep)}, which has none:</p>
                  <ul>
                    {p.fills.map((f) => <li key={f.field}>{FIELD_LABELS[f.field] || f.field}: {String(f.value)}</li>)}
                  </ul>
                </>
              )}
              {p.blockers.length > 0 && (
                <div className="flash flash-error">
                  These insurers can't be merged yet:
                  <ul style={{ margin: "0.25rem 0 0" }}>{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-danger" onClick={merge} disabled={busy || p.blockers.length > 0}>
                  {busy ? "Merging…" : `Merge and delete ${p.drop.insurer_ref || p.drop.name}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

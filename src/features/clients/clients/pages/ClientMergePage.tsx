import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface ClientOption {
  id: number;
  name: string;
  client_ref: string | null;
  city: string | null;
}

interface ClientSummary {
  id: number;
  name: string;
  client_ref: string | null;
}

interface MergePreview {
  keep: ClientSummary;
  drop: ClientSummary;
  moves: { label: string; count: number }[];
  fills: { field: string; value: string | number }[];
  notes: string[];
  blockers: string[];
}

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  city: "City",
  state: "State",
  assigned_broker_name: "Broker name",
  assigned_broker_phone: "Broker phone",
  assigned_broker_email: "Broker email",
  office_location: "Office location",
  account_type: "Account type",
  industry_sic: "Industry (SIC)",
  industry_naics: "Industry (NAICS)",
  lifecycle_stage: "Lifecycle stage",
  branch_id: "Branch",
  account_manager_user_id: "Account manager",
};

const label = (c: { name: string; client_ref: string | null }) => (c.client_ref ? `${c.name} (${c.client_ref})` : c.name);

/** Admin: merge a duplicate client into the one kept (its records move over, then it is deleted). */
export function ClientMergePage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [keepId, setKeepId] = useState(searchParams.get("keep") || "");
  const [dropId, setDropId] = useState(searchParams.get("drop") || "");
  const [keepFilter, setKeepFilter] = useState("");
  const [dropFilter, setDropFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const options = useQuery({ queryKey: ["clients", "options"], queryFn: () => api.get<{ clients: ClientOption[] }>("/api/clients/options") });
  const ready = keepId !== "" && dropId !== "" && keepId !== dropId;
  const preview = useQuery({
    queryKey: ["clients", "merge-preview", keepId, dropId],
    queryFn: () => api.get<MergePreview>(`/api/clients/merge?keep_id=${keepId}&drop_id=${dropId}`),
    enabled: ready,
  });
  const clients = options.data?.clients ?? [];
  const p = preview.data;

  async function merge() {
    if (!p) return;
    if (!window.confirm(`Move everything from ${label(p.drop)} to ${label(p.keep)} and delete ${label(p.drop)}? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post("/api/clients/merge", { keep_id: Number(keepId), drop_id: Number(dropId) });
      setDone(`${label(p.drop)} was merged into ${label(p.keep)} and deleted.`);
      setDropId("");
      setDropFilter("");
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not merge the clients.");
    } finally {
      setBusy(false);
    }
  }

  // A filter box over a list of every client: there can be thousands.
  const picker = (id: string, value: string, set: (v: string) => void, filter: string, setFilter: (v: string) => void, other: string) => {
    const f = filter.trim().toLowerCase();
    const shown = clients.filter((c) => String(c.id) === value || !f || `${c.name} ${c.client_ref || ""} ${c.city || ""}`.toLowerCase().includes(f));
    return (
      <>
        <input type="search" placeholder="Type to narrow the list…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={`Filter the ${id === "merge-keep" ? "client to keep" : "duplicate"} list`} />
        <select id={id} value={value} onChange={(e) => { set(e.target.value); setDone(null); setError(null); }}>
          <option value="">{shown.length ? `Choose a client… (${shown.length.toLocaleString()})` : "No client matches"}</option>
          {shown.slice(0, 500).map((c) => (
            <option key={c.id} value={String(c.id)} disabled={String(c.id) === other}>{label(c)}{c.city ? ` · ${c.city}` : ""}</option>
          ))}
        </select>
      </>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/clients">Clients</Link></p>
          <h1>Merge clients</h1>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0", maxWidth: "48rem" }}>
            For a client entered twice. Everything recorded against the duplicate (policies, receipts, claims, KYC, contacts, documents,
            deals, messages, portal logins and the rest) moves to the client you keep, any details the kept client is missing are copied from
            the duplicate, and the duplicate is deleted. The kept client's name, reference and account manager don't change.
          </p>
        </div>
      </div>

      {done && <div className="flash flash-success">{done}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="merge-keep">Client to keep</label>
            {picker("merge-keep", keepId, setKeepId, keepFilter, setKeepFilter, dropId)}
          </div>
          <div className="field">
            <label htmlFor="merge-drop">Duplicate to merge and delete</label>
            {picker("merge-drop", dropId, setDropId, dropFilter, setDropFilter, keepId)}
          </div>
        </div>
      </div>

      {ready && (
        <div className="card">
          {preview.isLoading && <p>Checking…</p>}
          {preview.isError && <div className="flash flash-error">{preview.error instanceof ApiError ? preview.error.message : "Could not check these clients."}</div>}
          {p && (
            <>
              <h2 style={{ marginTop: 0 }}>What will happen</h2>
              {p.moves.length === 0 ? (
                <p>{label(p.drop)} has no records; it will just be deleted.</p>
              ) : (
                <>
                  <p>Moves from {label(p.drop)} to {label(p.keep)}:</p>
                  <ul>{p.moves.map((m) => <li key={m.label}>{m.label}: {m.count.toLocaleString()}</li>)}</ul>
                </>
              )}
              {p.fills.length > 0 && (
                <>
                  <p>Copied to {label(p.keep)}, which has none:</p>
                  <ul>{p.fills.map((f) => <li key={f.field}>{FIELD_LABELS[f.field] || f.field}: {String(f.value)}</li>)}</ul>
                </>
              )}
              {p.notes.map((n) => <div key={n} className="flash flash-warning">{n}</div>)}
              {p.blockers.length > 0 && (
                <div className="flash flash-error">
                  These clients can't be merged:
                  <ul style={{ margin: "0.25rem 0 0" }}>{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-danger" onClick={merge} disabled={busy || p.blockers.length > 0}>
                  {busy ? "Merging…" : `Merge and delete ${p.drop.client_ref || p.drop.name}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

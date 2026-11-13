import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface DocTypeRow {
  id: number;
  area: Area;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: number;
  is_locked: number;
  n_documents: number;
}

type Area = "claim" | "client" | "deal";

const AREAS: { key: Area; label: string; where: string; back: { to: string; label: string } }[] = [
  { key: "claim", label: "Claims", where: "a file is uploaded to a claim, on the claim page", back: { to: "/claims", label: "Claims" } },
  { key: "client", label: "Clients", where: "a file is uploaded on a client's Documents tab", back: { to: "/clients", label: "Clients" } },
  { key: "deal", label: "Deals", where: "a file is uploaded on a deal's Documents tab", back: { to: "/deals", label: "Deals" } },
];

// Admin-only (backend platform/documents/documentTypes.routes.js). One list per area; the active types,
// in this order, are the Document Type choices when a file is uploaded there.
export function DocumentTypesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const area = (AREAS.find((a) => a.key === searchParams.get("area"))?.key ?? "claim") as Area;
  const current = AREAS.find((a) => a.key === area)!;
  const { data, isLoading } = useQuery({
    queryKey: ["document-types", area],
    queryFn: () => api.get<{ types: DocTypeRow[] }>(`/api/document-types?area=${area}`),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickArea(next: Area) {
    setError(null);
    setSearchParams({ area: next }, { replace: true });
  }

  async function refetch() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["document-types"] }),
      queryClient.invalidateQueries({ queryKey: ["claims"] }),
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["deals"] }),
    ]);
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await refetch();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/document-types", { area, name, description }), "Could not add the document type.");
    if (ok) {
      setName("");
      setDescription("");
    }
  }

  function handleEdit(row: DocTypeRow) {
    const nextName = row.is_locked ? row.name : window.prompt("Document type name", row.name);
    if (nextName === null) return;
    const nextDescription = window.prompt("Description (optional)", row.description || "");
    if (nextDescription === null) return;
    void run(() => api.put(`/api/document-types/${row.id}`, { name: nextName, description: nextDescription }), "Could not save the change.");
  }

  function handleToggle(row: DocTypeRow) {
    void run(() => api.put(`/api/document-types/${row.id}`, { is_active: row.is_active ? 0 : 1 }), "Could not save the change.");
  }

  function handleMove(row: DocTypeRow, direction: "up" | "down") {
    void run(() => api.post(`/api/document-types/${row.id}/move`, { direction }), "Could not move the document type.");
  }

  function handleDelete(row: DocTypeRow) {
    if (!confirmAction(`Delete "${row.name}"? This can't be undone.`)) return;
    void run(() => api.delete(`/api/document-types/${row.id}`), "Could not delete the document type.");
  }

  const rows = data?.types;
  const activeCount = rows?.filter((r) => r.is_active).length ?? 0;

  const columns: DataGridColumn<DocTypeRow>[] = [
    {
      key: "order",
      header: "Order",
      render: (r) => {
        const i = rows?.indexOf(r) ?? 0;
        return (
          <>
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy || i === 0} onClick={() => handleMove(r, "up")} aria-label={`Move ${r.name} up`}>
              ↑
            </button>{" "}
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy || i === (rows?.length ?? 1) - 1} onClick={() => handleMove(r, "down")} aria-label={`Move ${r.name} down`}>
              ↓
            </button>
          </>
        );
      },
    },
    { key: "name", header: "Document type", render: (r) => (r.is_active ? r.name : <span className="muted">{r.name}</span>) },
    { key: "description", header: "Description", render: (r) => r.description || "—" },
    { key: "documents", header: "Documents filed", render: (r) => r.n_documents },
    { key: "status", header: "Status", render: (r) => (r.is_locked ? "Required by the system" : r.is_active ? "Active" : "Inactive") },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <>
          <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => handleEdit(r)}>
            {r.is_locked ? "Edit description" : "Edit"}
          </button>
          {!r.is_locked && (
            <>
              {" "}
              <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => handleToggle(r)}>
                {r.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
          {!r.is_locked && r.n_documents === 0 && (
            <>
              {" "}
              <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => handleDelete(r)}>
                Delete
              </button>
            </>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Document Types</h1>
        <div className="page-header-actions">
          <Link to={current.back.to} className="btn-secondary btn-sm">{current.back.label}</Link>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {AREAS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={a.key === area}
            className={a.key === area ? "btn btn-sm" : "btn-secondary btn btn-sm"}
            onClick={() => pickArea(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="card">
        <h2>Add a {current.label.toLowerCase().replace(/s$/, "")} document type</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={handleCreate} className="form-grid">
          <div className="field">
            <label htmlFor="dt-name">Name</label>
            <input id="dt-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marine Survey Report" required />
          </div>
          <div className="field">
            <label htmlFor="dt-description">Description (optional)</label>
            <input id="dt-description" value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn" disabled={busy}>Add type</button>
          </div>
        </form>
        <p>
          The {activeCount} active types, in this order, are the Document Type choices when {current.where}. Renaming
          or deactivating a type doesn't change documents already filed under it. A type can be deleted only while no
          document uses it.
          {area === "deal" && " \"Proposal\" and \"Signed Application\" are required by the deal stage checks, so they can't be renamed or switched off."}
        </p>
      </div>

      <DataGrid columns={columns} rows={rows} isLoading={isLoading} getRowKey={(r) => r.id} emptyMessage="No document types yet." />
    </div>
  );
}

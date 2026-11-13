import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface BranchRow {
  id: number;
  name: string;
  address: string | null;
  is_active: number;
  n_users: number;
  n_clients: number;
}

// Admin-only (backend routes/branches.js). Branches are deactivated rather
// than deleted, because users and clients reference them.
export function BranchesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<{ branches: BranchRow[] }>("/api/branches"),
  });
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["branches"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
    ]);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/branches", { name, address });
      setName("");
      setAddress("");
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add branch.");
    }
  }

  async function handleUpdate(branch: BranchRow, changes: Partial<Pick<BranchRow, "name" | "address" | "is_active">>) {
    try {
      await api.put(`/api/branches/${branch.id}`, { name: branch.name, address: branch.address, ...changes });
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update branch.");
    }
  }

  function handleRename(branch: BranchRow) {
    const next = window.prompt("Branch name", branch.name);
    if (next && next.trim() && next.trim() !== branch.name) void handleUpdate(branch, { name: next.trim() });
  }

  const columns: DataGridColumn<BranchRow>[] = [
    { key: "name", header: "Branch", render: (b) => b.name },
    { key: "address", header: "Address", render: (b) => b.address || "—" },
    { key: "users", header: "Users", render: (b) => b.n_users },
    { key: "clients", header: "Clients", render: (b) => b.n_clients },
    { key: "status", header: "Status", render: (b) => (b.is_active ? "Active" : "Inactive") },
    {
      key: "actions",
      header: "",
      render: (b) => (
        <>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => handleRename(b)}>
            Rename
          </button>{" "}
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => handleUpdate(b, { is_active: b.is_active ? 0 : 1 })}>
            {b.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Branches</h1>
        <div className="page-header-actions">
          <Link to="/users" className="btn-secondary btn-sm">Users</Link>
        </div>
      </div>

      <div className="card">
        <h2>Add branch</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={handleCreate} className="form-grid">
          <div className="field">
            <label htmlFor="branch-name">Name</label>
            <input id="branch-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="branch-address">Address</label>
            <input id="branch-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn">Add branch</button>
          </div>
        </form>
        <p>Assign users to a branch on the Users page, and clients on each client's edit form.</p>
      </div>

      <DataGrid columns={columns} rows={data?.branches} isLoading={isLoading} getRowKey={(b) => b.id} emptyMessage="No branches yet." />
    </div>
  );
}

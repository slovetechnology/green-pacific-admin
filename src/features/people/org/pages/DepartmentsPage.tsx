import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import type { Department, OrgMeta } from "../lib/orgTypes";

const BLANK = { code: "", name: "", default_role_family: "", head_employee_id: "" };

// HR or admin. Departments are deactivated, never deleted, because
// employees reference them.
export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org", "departments"],
    queryFn: () => api.get<{ departments: Department[] }>("/api/org/departments"),
  });
  const meta = useQuery({ queryKey: ["org", "meta"], queryFn: () => api.get<OrgMeta>("/api/org/meta") });
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    await queryClient.invalidateQueries({ queryKey: ["org"] });
  }

  function startEdit(d: Department) {
    setError(null);
    setEditingId(d.id);
    setForm({ code: d.code, name: d.name, default_role_family: d.default_role_family || "", head_employee_id: d.head_employee_id ? String(d.head_employee_id) : "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) await api.put(`/api/org/departments/${editingId}`, form);
      else await api.post("/api/org/departments", form);
      cancelEdit();
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the department.");
    }
  }

  async function toggleActive(d: Department) {
    try {
      await api.put(`/api/org/departments/${d.id}`, { is_active: d.is_active ? 0 : 1 });
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the department.");
    }
  }

  const columns: DataGridColumn<Department>[] = [
    { key: "code", header: "Code", render: (d) => d.code },
    { key: "name", header: "Department", render: (d) => <Link to={`/org/employees?department_id=${d.id}`}>{d.name}</Link> },
    { key: "family", header: "Default role family", render: (d) => d.default_role_family || "—" },
    { key: "head", header: "Head", render: (d) => d.head_name || "—" },
    { key: "n", header: "Staff", align: "right", render: (d) => d.n_employees ?? 0 },
    { key: "status", header: "Status", render: (d) => (d.is_active ? "Active" : "Inactive") },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => startEdit(d)}>Edit</button>{" "}
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => toggleActive(d)}>
            {d.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Departments</h1>
        <div className="page-header-actions">
          <Link to="/org/employees" className="btn-secondary btn-sm">Employees</Link>
        </div>
      </div>

      <div className="card">
        <h2>{editingId ? `Edit ${form.name}` : "Add department"}</h2>
        {error && <div className="flash flash-error">{error}</div>}
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="field">
            <label htmlFor="dept-code">Code</label>
            <input id="dept-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required maxLength={10} />
          </div>
          <div className="field">
            <label htmlFor="dept-name">Name</label>
            <input id="dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="dept-family">Default role family</label>
            <select id="dept-family" value={form.default_role_family} onChange={(e) => setForm({ ...form, default_role_family: e.target.value })}>
              <option value="">None</option>
              {meta.data?.roleFamilies.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {editingId && (
            <div className="field">
              <label htmlFor="dept-head">Head of department</label>
              <select id="dept-head" value={form.head_employee_id} onChange={(e) => setForm({ ...form, head_employee_id: e.target.value })}>
                <option value="">None</option>
                {meta.data?.managers.map((x) => (
                  <option key={x.id} value={x.id}>{x.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field" style={{ justifyContent: "flex-end", flexDirection: "row", gap: "0.5rem", alignItems: "flex-end" }}>
            <button type="submit" className="btn">{editingId ? "Save" : "Add department"}</button>
            {editingId && <button type="button" className="btn-secondary btn" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </div>

      <DataGrid columns={columns} rows={data?.departments} isLoading={isLoading} getRowKey={(d) => d.id} emptyMessage="No departments yet." />
    </div>
  );
}

import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { STATUS_BADGE, type Employee, type OrgMeta } from "../lib/orgTypes";

// HR or admin (backend routes/org.js). The org chart the appraisal module
// hangs off: who each person is, their department and their line manager.
export function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const departmentId = params.get("department_id") || "";
  const status = params.get("status") ?? "current";

  const meta = useQuery({ queryKey: ["org", "meta"], queryFn: () => api.get<OrgMeta>("/api/org/meta") });
  const { data, isLoading } = useQuery({
    queryKey: ["org", "employees", q, departmentId, status],
    queryFn: () =>
      api.get<{ employees: Employee[] }>(
        `/api/org/employees?${new URLSearchParams({ q, department_id: departmentId, status }).toString()}`
      ),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  }

  const columns: DataGridColumn<Employee>[] = [
    { key: "staff_no", header: "Staff no", render: (e) => e.staff_no },
    { key: "name", header: "Name", render: (e) => <Link to={`/org/employees/${e.id}`}>{e.full_name}</Link> },
    { key: "title", header: "Job title", render: (e) => e.job_title || "—" },
    { key: "department", header: "Department", render: (e) => e.department_name },
    { key: "family", header: "Role family", render: (e) => e.role_family },
    { key: "manager", header: "Line manager", render: (e) => e.line_manager_name || "—" },
    { key: "login", header: "Login", render: (e) => e.username || <span style={{ color: "var(--text-muted)" }}>None</span> },
    { key: "status", header: "Status", render: (e) => <span className={`badge ${STATUS_BADGE[e.status]}`}>{e.status}</span> },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Employees</h1>
        <div className="page-header-actions">
          <Link to="/org/departments" className="btn-secondary btn-sm">Departments</Link>
          <Link to="/org/attribution" className="btn-secondary btn-sm">Record attribution</Link>
          <Link to="/org/employees/import" className="btn-secondary btn-sm">Import from Excel</Link>
          <Link to="/org/employees/new" className="btn">+ Add employee</Link>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, staff no, title or login…"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam("q", (e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => updateParam("q", e.target.value)}
        />
        <select value={departmentId} onChange={(e) => updateParam("department_id", e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {meta.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => updateParam("status", e.target.value)} aria-label="Status">
          <option value="current">Current staff</option>
          <option value="">Everyone, including leavers</option>
          {meta.data?.statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.employees}
        isLoading={isLoading}
        getRowKey={(e) => e.id}
        emptyMessage="No employees match. Add them one at a time or import the whole org chart from Excel."
      />
    </div>
  );
}

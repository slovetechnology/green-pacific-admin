import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface TaskRow {
  id: number;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  entity_type: string | null;
  entity_id: number | null;
  assigned_to: string | null;
  is_overdue: boolean;
  entity_label: string | null;
  entity_url: string | null;
}

interface Response {
  tasks: TaskRow[];
  status: string;
  assignedTo: string;
  assignees: string[];
}

const STATUS_FILTERS = ["Open", "Done", "All"];

export function TasksListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = searchParams.get("status") || "Open";
  const assignedTo = searchParams.get("assigned_to") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", status, assignedTo],
    queryFn: () => api.get<Response>(`/api/tasks?status=${encodeURIComponent(status)}&assigned_to=${encodeURIComponent(assignedTo)}`),
  });
  const search = useRowSearch(data?.tasks, (t) => [t.title, t.notes, t.assigned_to, t.entity_label, t.priority]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  async function toggleComplete(taskId: number) {
    await api.post(`/api/tasks/${taskId}/complete`);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function deleteTask(taskId: number) {
    if (!confirmAction("Delete this task?")) return;
    await api.delete(`/api/tasks/${taskId}`);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  const columns: DataGridColumn<TaskRow>[] = [
    {
      key: "title",
      header: "Title",
      render: (t) => (
        <>
          {t.title}
          {t.notes && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t.notes}</div>}
        </>
      ),
    },
    {
      key: "linked_to",
      header: "Linked To",
      render: (t) => (t.entity_url && t.entity_label ? <Link to={t.entity_url}>{t.entity_label}</Link> : "—"),
    },
    { key: "due", header: "Due", render: (t) => `${t.due_date || "—"}${t.is_overdue ? " (overdue)" : ""}` },
    { key: "priority", header: "Priority", render: (t) => t.priority },
    { key: "assigned_to", header: "Assigned To", render: (t) => t.assigned_to || "—" },
    { key: "status", header: "Status", render: (t) => t.status },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <RoleGate need="write">
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => toggleComplete(t.id)}>
              {t.status === "Done" ? "Reopen" : "Complete"}
            </button>
            <button type="button" className="btn-danger btn-sm" onClick={() => deleteTask(t.id)}>
              Delete
            </button>
          </div>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Tasks &amp; Reminders</p>
          <h1>Tasks</h1>
        </div>
        <RoleGate need="write">
          <button type="button" className="btn" onClick={() => navigate("/tasks/new")}>
            + New Task
          </button>
        </RoleGate>
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => updateParam("status", e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={assignedTo} onChange={(e) => updateParam("assigned_to", e.target.value)}>
          <option value="">Everyone</option>
          {data?.assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Title, notes, assignee or linked record…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
        getRowStyle={(t) => (t.is_overdue ? { color: "var(--status-critical)" } : undefined)}
        emptyMessage="No tasks found."
      />
    </div>
  );
}

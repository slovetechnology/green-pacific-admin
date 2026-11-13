import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";

interface FormOptions {
  priorities: string[];
  entityTypes: string[];
  entityLabel: string | null;
  assignees: string[];
}

export function TaskFormPage() {
  const [searchParams] = useSearchParams();
  const entityType = searchParams.get("entity_type") || "";
  const entityId = searchParams.get("entity_id") || "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: opts } = useQuery({
    queryKey: ["tasks", "meta", entityType, entityId],
    queryFn: () =>
      api.get<FormOptions>(
        `/api/tasks/meta/form-options?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`
      ),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/tasks", {
        title, notes, due_date: dueDate, priority,
        entity_type: entityType || null, entity_id: entityId || null,
        assigned_to: assignedTo,
      });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate("/tasks");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Task</h1>
      </div>
      {opts?.entityLabel && <p className="page-lede">Linked to: {opts.entityLabel}</p>}
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="title">Title *</label>
              <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="due_date">Due Date</label>
              <input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {(opts?.priorities || ["Low", "Normal", "High"]).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="assigned_to">Assigned To</label>
              <select id="assigned_to" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {opts?.assignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="field span-3">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : "Create task"}
            </button>
            <button type="button" className="btn-secondary btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

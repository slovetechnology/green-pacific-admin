import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { useAuth } from "@/features/platform/auth/AuthContext";

interface Rule {
  id: number;
  code: string;
  name: string;
  class_of_business: string | null;
  days_before: number;
  due_days_before: number;
  title_template: string;
  notes_template: string | null;
  priority: string;
  assign_to: string | null;
  is_active: number;
  tasks_created: number;
}

interface RulesResponse {
  rules: Rule[];
  placeholders: string[];
  priorities: string[];
}

interface RunResult {
  checked: number;
  tasksCreated: number;
  skippedRenewed: number;
  tasks: { ruleId: number; rule: string; transactionId: number; title: string; due_date?: string }[];
}

// Renewal workflow rules: which task to raise, for which class, how many days before expiry. The daily
// job (backend policies/renewalRules.js) applies them; "Preview" shows what it would create right now.
export function RenewalRulesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["renewal-rules"], queryFn: () => api.get<RulesResponse>("/api/renewal-rules") });
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [result, setResult] = useState<{ label: string; run: RunResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: () => api.get<RunResult>("/api/renewal-rules/preview"),
    onSuccess: (run) => setResult({ label: "Would create", run }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not preview."),
  });
  const runNow = useMutation({
    mutationFn: () => api.post<RunResult>("/api/renewal-rules/run", {}),
    onSuccess: async (run) => {
      setResult({ label: "Created", run });
      await queryClient.invalidateQueries({ queryKey: ["renewal-rules"] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not run the rules."),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Renewals</p>
          <h1>Renewal Rules</h1>
        </div>
        <div className="toolbar">
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => preview.mutate()} disabled={preview.isPending}>
            Preview
          </button>
          <RoleGate need="write">
            <button type="button" className="btn btn-sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              Run rules now
            </button>
          </RoleGate>
          {user?.isAdmin && (
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => setEditing("new")}>
              + Add rule
            </button>
          )}
        </div>
      </div>
      <p>
        Each day, a rule creates its task once for every policy in the chosen class that is inside its window and has not already been
        renewed. Tasks go to the client's account manager unless the rule names someone.
      </p>
      {error && <div className="flash flash-error">{error}</div>}
      {result && (
        <div className="card">
          <strong>
            {result.label} {result.run.tasksCreated} task{result.run.tasksCreated === 1 ? "" : "s"}
          </strong>
          {result.run.skippedRenewed > 0 && <small> · {result.run.skippedRenewed} policies skipped as already renewed</small>}
          <ul>
            {result.run.tasks.slice(0, 20).map((t) => (
              <li key={`${t.ruleId}:${t.transactionId}`}>{t.title}</li>
            ))}
          </ul>
        </div>
      )}
      {editing && data && <RuleForm rule={editing === "new" ? null : editing} placeholders={data.placeholders} priorities={data.priorities} onDone={() => setEditing(null)} />}
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Applies to</th>
                <th>Creates task</th>
                <th>Due</th>
                <th>Assigned to</th>
                <th>Tasks so far</th>
                <th>Status</th>
                {user?.isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div>
                      <small>{r.title_template}</small>
                    </div>
                  </td>
                  <td>{r.class_of_business ? r.class_of_business.split("|").join(", ") : "All classes"}</td>
                  <td>{r.days_before} days before expiry</td>
                  <td>{r.due_days_before} days before expiry</td>
                  <td>{r.assign_to || "Account manager"}</td>
                  <td>{r.tasks_created}</td>
                  <td>{r.is_active ? "On" : "Off"}</td>
                  {user?.isAdmin && (
                    <td>
                      <button type="button" className="btn-secondary btn btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RuleForm({ rule, placeholders, priorities, onDone }: { rule: Rule | null; placeholders: string[]; priorities: string[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(rule?.name ?? "");
  const [classOfBusiness, setClassOfBusiness] = useState(rule?.class_of_business ?? "");
  const [daysBefore, setDaysBefore] = useState(String(rule?.days_before ?? 60));
  const [dueDaysBefore, setDueDaysBefore] = useState(String(rule?.due_days_before ?? 30));
  const [title, setTitle] = useState(rule?.title_template ?? "");
  const [notes, setNotes] = useState(rule?.notes_template ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? "Normal");
  const [assignTo, setAssignTo] = useState(rule?.assign_to ?? "");
  const [isActive, setIsActive] = useState(rule ? Boolean(rule.is_active) : true);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const body = {
      name,
      class_of_business: classOfBusiness,
      days_before: daysBefore,
      due_days_before: dueDaysBefore,
      title_template: title,
      notes_template: notes,
      priority,
      assign_to: assignTo,
      is_active: isActive,
    };
    try {
      if (rule) await api.put(`/api/renewal-rules/${rule.id}`, body);
      else await api.post("/api/renewal-rules", body);
      await queryClient.invalidateQueries({ queryKey: ["renewal-rules"] });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the rule.");
    }
  }

  return (
    <div className="card">
      <h2>{rule ? `Edit rule: ${rule.name}` : "Add rule"}</h2>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="form-grid">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Statement of values (property)" />
        </label>
        <label>
          Class of business (blank = all)
          <input value={classOfBusiness} onChange={(e) => setClassOfBusiness(e.target.value)} placeholder="e.g. Fire and Special Perils" />
        </label>
        <label>
          Create the task this many days before expiry
          <input type="number" min={1} value={daysBefore} onChange={(e) => setDaysBefore(e.target.value)} />
        </label>
        <label>
          Task is due this many days before expiry
          <input type="number" min={0} value={dueDaysBefore} onChange={(e) => setDueDaysBefore(e.target.value)} />
        </label>
        <label>
          Task title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Request updated statement of values: {client} ({policy_no})" />
        </label>
        <label>
          Task notes
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Assign to username (blank = account manager)
          <input value={assignTo} onChange={(e) => setAssignTo(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Rule is on
        </label>
      </div>
      <p>
        <small>
          Placeholders: {placeholders.map((p) => `{${p}}`).join(" ")}. List several class spellings with "|"; "Fire and Special Perils" also
          covers its "— sub-type" variants. Editing a rule never re-creates tasks already raised.
        </small>
      </p>
      <button type="button" className="btn" onClick={save}>
        Save rule
      </button>{" "}
      <button type="button" className="btn-secondary btn" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

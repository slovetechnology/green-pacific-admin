import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { DataGrid } from "@/shared/components/DataGrid";
import { STATUS_BADGE, type Employee, type OrgMeta } from "../lib/orgTypes";

interface EmployeeDetail {
  employee: Employee;
  reports: { id: number; staff_no: string; full_name: string; job_title: string | null; status: string; department_name: string; depth: number; line_manager_name: string | null }[];
  managerChain: { id: number; staff_no: string; full_name: string; job_title: string | null }[];
  appraisalRoles: string[];
}

const EMPTY = {
  staff_no: "", full_name: "", gender: "", email: "", user_id: "", department_id: "", job_title: "", role_family: "",
  line_manager_id: "", branch_id: "", hire_date: "", probation_end_date: "", confirmation_date: "",
  exit_date: "", exit_reason: "", status: "Probation",
};
type FormState = typeof EMPTY;

export function EmployeeFormPage() {
  const { employeeId } = useParams();
  const isEdit = Boolean(employeeId);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>({ ...EMPTY, user_id: searchParams.get("user_id") || "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const meta = useQuery({ queryKey: ["org", "meta"], queryFn: () => api.get<OrgMeta>("/api/org/meta") });
  const detail = useQuery({
    queryKey: ["org", "employee", employeeId],
    queryFn: () => api.get<EmployeeDetail>(`/api/org/employees/${employeeId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    const e = detail.data?.employee;
    if (!e) return;
    const s = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));
    setForm({
      staff_no: e.staff_no, full_name: e.full_name, gender: s(e.gender), email: s(e.email), user_id: s(e.user_id),
      department_id: s(e.department_id), job_title: s(e.job_title), role_family: e.role_family,
      line_manager_id: s(e.line_manager_id), branch_id: s(e.branch_id), hire_date: s(e.hire_date),
      probation_end_date: s(e.probation_end_date), confirmation_date: s(e.confirmation_date),
      exit_date: s(e.exit_date), exit_reason: s(e.exit_reason), status: e.status,
    });
  }, [detail.data]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  // Picking a department fills an empty role family with its default.
  function setDepartment(value: string) {
    const dept = meta.data?.departments.find((d) => String(d.id) === value);
    setSaved(false);
    setForm((f) => ({ ...f, department_id: value, role_family: f.role_family || dept?.default_role_family || "" }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/api/org/employees/${employeeId}`, form);
        setSaved(true);
      } else {
        const res = await api.post<{ employee: Employee }>("/api/org/employees", form);
        navigate(`/org/employees/${res.employee.id}`, { replace: true });
      }
      await queryClient.invalidateQueries({ queryKey: ["org"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const m = meta.data;
  const selfId = Number(employeeId);
  // Logins already linked to someone else are left out of the picker.
  const loginOptions = (m?.users || []).filter((u) => !u.employee_id || u.employee_id === selfId);
  const managerOptions = (m?.managers || []).filter((x) => x.id !== selfId);
  const d = detail.data;

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? form.full_name || "Employee" : "Add employee"}</h1>
        <div className="page-header-actions">
          {d && <span className={`badge ${STATUS_BADGE[d.employee.status]}`}>{d.employee.status}</span>}
          <Link to="/org/employees" className="btn-secondary btn-sm">All employees</Link>
        </div>
      </div>

      <div className="card">
        {error && <div className="flash flash-error">{error}</div>}
        {saved && <div className="flash flash-success">Saved.</div>}
        <form onSubmit={handleSubmit}>
          <div className="section-title">Person</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="staff_no">Staff number</label>
              <input id="staff_no" value={form.staff_no} onChange={set("staff_no")} required />
            </div>
            <div className="field">
              <label htmlFor="full_name">Full name</label>
              <input id="full_name" value={form.full_name} onChange={set("full_name")} required />
            </div>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="field">
              <label htmlFor="user_id">ERP login</label>
              <select id="user_id" value={form.user_id} onChange={set("user_id")}>
                <option value="">No login</option>
                {loginOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-title">Role</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="department_id">Department</label>
              <select id="department_id" value={form.department_id} onChange={(e) => setDepartment(e.target.value)} required>
                <option value="">Choose…</option>
                {(m?.departments || [])
                  .filter((x) => x.is_active || String(x.id) === form.department_id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gender">Gender</label>
              <select id="gender" value={form.gender} onChange={set("gender")}>
                <option value="">Not recorded</option>
                {(m?.genders || ["Male", "Female"]).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <div className="field-hint">Reported on the NAICOM staff return.</div>
            </div>
            <div className="field">
              <label htmlFor="job_title">Job title</label>
              <input id="job_title" value={form.job_title} onChange={set("job_title")} />
            </div>
            <div className="field">
              <label htmlFor="role_family">Role family (appraisal template)</label>
              <select id="role_family" value={form.role_family} onChange={set("role_family")} required>
                <option value="">Choose…</option>
                {(m?.roleFamilies || []).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="line_manager_id">Line manager</label>
              <select id="line_manager_id" value={form.line_manager_id} onChange={set("line_manager_id")}>
                <option value="">None (top of the organisation)</option>
                {managerOptions.map((x) => (
                  <option key={x.id} value={x.id}>{x.full_name}{x.job_title ? `, ${x.job_title}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="branch_id">Branch</label>
              <select id="branch_id" value={form.branch_id} onChange={set("branch_id")}>
                <option value="">None</option>
                {(m?.branches || []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-title">Employment</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="hire_date">Hire date</label>
              <input id="hire_date" type="date" value={form.hire_date} onChange={set("hire_date")} />
            </div>
            <div className="field">
              <label htmlFor="probation_end_date">Probation ends</label>
              <input id="probation_end_date" type="date" value={form.probation_end_date} onChange={set("probation_end_date")} />
              <small style={{ color: "var(--text-muted)" }}>Blank: 6 months after the hire date.</small>
            </div>
            <div className="field">
              <label htmlFor="confirmation_date">Confirmed on</label>
              <input id="confirmation_date" type="date" value={form.confirmation_date} onChange={set("confirmation_date")} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" value={form.exit_date ? "Exited" : form.status} onChange={set("status")} disabled={Boolean(form.exit_date)}>
                <option value="Probation">Probation</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Exited">Exited</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="exit_date">Exit date</label>
              <input id="exit_date" type="date" value={form.exit_date} onChange={set("exit_date")} />
            </div>
            {form.exit_date && (
              <div className="field">
                <label htmlFor="exit_reason">Exit reason</label>
                <input id="exit_reason" value={form.exit_reason} onChange={set("exit_reason")} />
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
            </button>
          </div>
        </form>
      </div>

      {d && (
        <>
          <div className="card">
            <h2>Reporting line</h2>
            <p>
              {d.managerChain.length
                ? d.managerChain.map((x, i) => (
                    <span key={x.id}>
                      {i > 0 && " → "}
                      <Link to={`/org/employees/${x.id}`}>{x.full_name}</Link>
                    </span>
                  ))
                : "No line manager: this person is at the top of the organisation."}
            </p>
            <h3>Reports ({d.reports.length})</h3>
            <DataGrid
              columns={[
                { key: "name", header: "Name", render: (r) => <Link to={`/org/employees/${r.id}`}>{r.full_name}</Link> },
                { key: "title", header: "Job title", render: (r) => r.job_title || "—" },
                { key: "dept", header: "Department", render: (r) => r.department_name },
                { key: "via", header: "Reports to", render: (r) => (r.depth === 1 ? "Directly" : r.line_manager_name) },
                { key: "status", header: "Status", render: (r) => <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span> },
              ]}
              rows={d.reports}
              isLoading={false}
              getRowKey={(r) => r.id}
              emptyMessage="Nobody reports to this person."
            />
          </div>

          <AppraisalRolesCard
            userId={d.employee.user_id}
            current={d.appraisalRoles}
            roles={m?.appraisalRoles || []}
            canEdit={Boolean(user?.isAdmin)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["org"] })}
          />
        </>
      )}
    </div>
  );
}

function AppraisalRolesCard({
  userId, current, roles, canEdit, onSaved,
}: {
  userId: number | null;
  current: string[];
  roles: OrgMeta["appraisalRoles"];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  useEffect(() => setSelected(current), [current]);

  if (!userId) {
    return (
      <div className="card">
        <h2>Appraisal roles</h2>
        <p>Link this employee to an ERP login before giving them an appraisal role.</p>
      </div>
    );
  }

  async function save() {
    setMessage(null);
    try {
      await api.put(`/api/org/appraisal-roles/${userId}`, { roles: selected });
      setMessage({ kind: "success", text: "Appraisal roles saved." });
      onSaved();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Could not save roles." });
    }
  }

  return (
    <div className="card">
      <h2>Appraisal roles</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Separate from the login's access role. {canEdit ? "" : "Only an admin can change these."}
      </p>
      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {roles.map((r) => (
          <label key={r.role} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
            <input
              type="checkbox"
              checked={selected.includes(r.role)}
              disabled={!canEdit}
              onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.role] : s.filter((x) => x !== r.role)))}
            />
            <span>
              <strong>{r.label}</strong> <span style={{ color: "var(--text-muted)" }}>{r.description}</span>
            </span>
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="form-actions">
          <button type="button" className="btn" onClick={save}>Save roles</button>
        </div>
      )}
    </div>
  );
}

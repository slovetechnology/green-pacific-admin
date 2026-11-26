import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import type { PersonProfile } from "../lib/types";
import { Notice } from "./Badges";
import { SelectField, TextField } from "./Fields";

// Line of Authority matrix: pick a person to see which lines they may write and grant or withdraw one.
export function LoaTab() {
  const meta = useHrMeta();
  const [employeeId, setEmployeeId] = useState("");
  const { run, notice, busy } = useAction();
  const [form, setForm] = useState({ loa_type_id: "", licence_id: "", granted_on: "", expires_on: "", status: "Active" });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const profile = useQuery({
    queryKey: ["hr", "profile", employeeId],
    queryFn: () => api.get<{ profile: PersonProfile }>(`/api/hr/employees/${employeeId}/profile`),
    enabled: Boolean(employeeId),
  });
  const held = new Set(profile.data?.profile.loa.map((l) => l.loa_type_id));
  const authorising = (profile.data?.profile.licences ?? []).filter((l) => l.licence_type !== "CIIN Membership");

  async function grant(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/hr/loa", { ...form, employee_id: employeeId }), "Authority saved.");
    if (ok !== undefined) setForm({ loa_type_id: "", licence_id: "", granted_on: "", expires_on: "", status: "Active" });
  }

  return (
    <div>
      <Notice notice={notice} />
      <div className="card hr-form">
        <div className="form-grid">
          <SelectField label="Person" value={employeeId} onChange={setEmployeeId} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
        </div>
      </div>
      {employeeId && profile.data && (
        <>
          <div className="card">
            <h2>Lines of authority — {profile.data.profile.employee.full_name}</h2>
            <p className="hr-hint">
              {profile.data.profile.status.licensed ? "Holds an in-force NAICOM licence." : "No in-force NAICOM licence: authorities below are not usable until one is recorded."}
            </p>
            <div className="exec-table-wrap table-wrap">
              <table className="exec-table is-static hr-table">
                <thead><tr><th>Line</th><th>Status</th><th>Granted</th><th>Expires</th><th /></tr></thead>
                <tbody>
                  {profile.data.profile.loa.length === 0 && <tr><td colSpan={5} className="empty-state">No lines of authority recorded.</td></tr>}
                  {profile.data.profile.loa.map((l) => (
                    <tr key={l.id}>
                      <td>{l.loa_name}</td>
                      <td>{l.status}</td>
                      <td>{l.granted_on ?? "—"}</td>
                      <td>{l.expires_on ?? "—"}</td>
                      <td>
                        <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => window.confirm(`Remove ${l.loa_name}?`) && run(() => api.delete(`/api/hr/loa/${l.id}`), "Authority removed.")}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <form className="card hr-form" onSubmit={grant}>
            <h2>Grant a line of authority</h2>
            <div className="form-grid">
              <SelectField label="Line" required value={form.loa_type_id} onChange={set("loa_type_id")} options={(meta.data?.loaTypes ?? []).filter((t) => t.is_active).map((t) => ({ value: t.id, label: `${t.name}${held.has(t.id) ? " (update)" : ""}` }))} />
              <SelectField label="Under licence" value={form.licence_id} onChange={set("licence_id")} blank="Not linked" options={authorising.map((l) => ({ value: l.id, label: `${l.licence_type} ${l.licence_no}` }))} />
              <TextField label="Granted on" type="date" value={form.granted_on} onChange={set("granted_on")} />
              <TextField label="Expires on" type="date" value={form.expires_on} onChange={set("expires_on")} />
              <SelectField label="Status" blank={null} value={form.status} onChange={set("status")} options={(meta.data?.loaStatuses ?? []).map((s) => ({ value: s, label: s }))} />
            </div>
            <div className="form-actions"><button type="submit" className="btn" disabled={busy}>Save authority</button></div>
          </form>
        </>
      )}
    </div>
  );
}

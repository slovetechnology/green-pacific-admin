import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import type { CeCycle, CeProgressRow } from "../lib/types";
import { Notice } from "./Badges";
import { SelectField, TextField, today } from "./Fields";

// Continuing education: the hours each cycle requires, and who has done how many. Shortfalls sort first.
export function CeTab() {
  const meta = useHrMeta();
  const { run, notice, busy } = useAction();
  const cycles = meta.data?.cycles ?? [];
  const [cycleId, setCycleId] = useState("");
  const chosen = cycleId || String(cycles.find((c) => c.is_active)?.id ?? cycles[0]?.id ?? "");
  const progress = useQuery({
    queryKey: ["hr", "ce", chosen],
    queryFn: () => api.get<{ cycle: CeCycle; rows: CeProgressRow[] }>(`/api/hr/ce/cycles/${chosen}/progress`),
    enabled: Boolean(chosen),
  });
  const [cycle, setCycle] = useState({ name: "", starts_on: "", ends_on: "", required_hours: "", applies_to: "licensed" });
  const [rec, setRec] = useState({ employee_id: "", title: "", provider: "", hours: "", status: "Completed", completed_on: today(), planned_on: "" });

  async function addCycle(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/hr/ce/cycles", cycle), "Cycle added.");
    if (ok !== undefined) setCycle({ name: "", starts_on: "", ends_on: "", required_hours: "", applies_to: "licensed" });
  }
  async function addRecord(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post("/api/hr/ce/records", { ...rec, cycle_id: chosen }), "Hours logged.");
    if (ok !== undefined) setRec({ ...rec, employee_id: "", title: "", provider: "", hours: "" });
  }

  return (
    <div>
      <Notice notice={notice} />
      <div className="card">
        <div className="hr-toolbar">
          <h2 style={{ margin: 0 }}>Progress</h2>
          <select aria-label="CE cycle" value={chosen} onChange={(e) => setCycleId(e.target.value)}>
            {cycles.length === 0 && <option value="">No cycles yet</option>}
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.starts_on} → {c.ends_on}, {c.required_hours}h)</option>)}
          </select>
        </div>
        <div className="exec-table-wrap table-wrap">
          <table className="exec-table is-static hr-table">
            <thead><tr><th>Person</th><th className="num">Completed</th><th className="num">Planned</th><th className="num">Required</th><th className="num">Shortfall</th><th>Status</th></tr></thead>
            <tbody>
              {progress.data?.rows.length === 0 && <tr><td colSpan={6} className="empty-state">Nobody this cycle applies to yet.</td></tr>}
              {progress.data?.rows.map((r) => (
                <tr key={r.employee_id} className={r.met ? undefined : "hr-row-alert"}>
                  <td>{r.employee_name} <small>{r.staff_no}</small></td>
                  <td className="num">{r.completed}h</td>
                  <td className="num">{r.planned}h</td>
                  <td className="num">{r.required}h</td>
                  <td className="num">{r.shortfall}h</td>
                  <td>{r.met ? "Met" : "Outstanding"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {chosen && (
        <form className="card hr-form" onSubmit={addRecord}>
          <h2>Log CE hours</h2>
          <div className="form-grid">
            <SelectField label="Person" required value={rec.employee_id} onChange={(v) => setRec({ ...rec, employee_id: v })} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
            <TextField label="Course" required value={rec.title} onChange={(v) => setRec({ ...rec, title: v })} />
            <TextField label="Provider" value={rec.provider} onChange={(v) => setRec({ ...rec, provider: v })} />
            <TextField label="Hours" type="number" step="0.25" required value={rec.hours} onChange={(v) => setRec({ ...rec, hours: v })} />
            <SelectField label="Status" blank={null} value={rec.status} onChange={(v) => setRec({ ...rec, status: v })} options={[{ value: "Completed", label: "Completed" }, { value: "Planned", label: "Planned" }]} />
            {rec.status === "Completed" ? (
              <TextField label="Completed on" type="date" required value={rec.completed_on} onChange={(v) => setRec({ ...rec, completed_on: v })} />
            ) : (
              <TextField label="Planned for" type="date" required value={rec.planned_on} onChange={(v) => setRec({ ...rec, planned_on: v })} />
            )}
          </div>
          <div className="form-actions"><button type="submit" className="btn" disabled={busy}>Log hours</button></div>
        </form>
      )}
      <form className="card hr-form" onSubmit={addCycle}>
        <h2>New CE cycle</h2>
        <div className="form-grid">
          <TextField label="Name" required value={cycle.name} onChange={(v) => setCycle({ ...cycle, name: v })} placeholder="2027 CIIN CPD" />
          <TextField label="Starts" type="date" required value={cycle.starts_on} onChange={(v) => setCycle({ ...cycle, starts_on: v })} />
          <TextField label="Ends" type="date" required value={cycle.ends_on} onChange={(v) => setCycle({ ...cycle, ends_on: v })} />
          <TextField label="Hours required" type="number" step="0.5" required value={cycle.required_hours} onChange={(v) => setCycle({ ...cycle, required_hours: v })} />
          <SelectField label="Applies to" blank={null} value={cycle.applies_to} onChange={(v) => setCycle({ ...cycle, applies_to: v })} options={[{ value: "licensed", label: "People with an NAICOM licence" }, { value: "all", label: "All staff" }]} />
        </div>
        <div className="form-actions"><button type="submit" className="btn-secondary btn" disabled={busy}>Add cycle</button></div>
      </form>
    </div>
  );
}

import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { api } from "@/shared/api/client";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import { useServerTable } from "../hooks/useServerTable";
import type { Appointment } from "../lib/types";
import { ExpiryBadge, Notice } from "./Badges";
import { SelectField, TextField, today } from "./Fields";
import { ServerTable } from "./ServerTable";

const blank = { employee_id: "", insurer_id: "", agency_code: "", status: "Active", appointed_on: "", expires_on: "", terminated_on: "", notes: "" };

// Which insurers have appointed which people. Filter by carrier and status; ending an appointment keeps the
// row as history.
export function AppointmentsTab() {
  const meta = useHrMeta();
  const table = useServerTable<Appointment>("/api/hr/appointments", {}, [{ id: "employee", desc: false }]);
  const { run, notice, busy } = useAction();
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function open(a: Appointment | "new") {
    setEditing(a);
    setForm(a === "new" ? blank : { employee_id: String(a.employee_id), insurer_id: String(a.insurer_id), agency_code: a.agency_code ?? "", status: a.status, appointed_on: a.appointed_on ?? "", expires_on: a.expires_on ?? "", terminated_on: a.terminated_on ?? "", notes: a.notes ?? "" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isNew = editing === "new";
    const body = form.status === "Terminated" && !form.terminated_on ? { ...form, terminated_on: today() } : form;
    const ok = await run(() => (isNew ? api.post("/api/hr/appointments", body) : api.put(`/api/hr/appointments/${(editing as Appointment).id}`, body)), isNew ? "Appointment added." : "Appointment updated.");
    if (ok !== undefined) setEditing(null);
  }

  const columns = useMemo<ColumnDef<Appointment, unknown>[]>(
    () => [
      { id: "employee", header: "Person", cell: ({ row }) => <strong>{row.original.employee_name}</strong> },
      { id: "insurer", header: "Carrier", cell: ({ row }) => row.original.insurer_name },
      { id: "agency_code", header: "Agency code", enableSorting: false, cell: ({ row }) => row.original.agency_code ?? "—" },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      { id: "appointed", header: "Appointed", cell: ({ row }) => row.original.appointed_on ?? "—" },
      { id: "expires", header: "Expiry", cell: ({ row }) => <ExpiryBadge band={row.original.band} date={row.original.expires_on} /> },
      { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <button type="button" className="btn-secondary btn btn-sm" onClick={() => open(row.original)}>Edit</button> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      <Notice notice={notice} />
      {editing && (
        <form className="card hr-form" onSubmit={submit}>
          <h2>{editing === "new" ? "Record an appointment" : "Edit appointment"}</h2>
          <div className="form-grid">
            {editing === "new" && (
              <>
                <SelectField label="Person" required value={form.employee_id} onChange={set("employee_id")} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
                <SelectField label="Carrier" required value={form.insurer_id} onChange={set("insurer_id")} options={(meta.data?.insurers ?? []).map((i) => ({ value: i.id, label: i.name }))} />
              </>
            )}
            <TextField label="Agency code" value={form.agency_code} onChange={set("agency_code")} />
            <SelectField label="Status" blank={null} value={form.status} onChange={set("status")} options={(meta.data?.appointmentStatuses ?? []).map((t) => ({ value: t, label: t }))} />
            <TextField label="Appointed on" type="date" value={form.appointed_on} onChange={set("appointed_on")} />
            <TextField label="Expires on" type="date" value={form.expires_on} onChange={set("expires_on")} />
            <TextField label="Notes" value={form.notes} onChange={set("notes")} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      <ServerTable
        table={table}
        columns={columns}
        getRowKey={(r) => r.id}
        emptyMessage="No appointments match."
        toolbar={
          <>
            <select aria-label="Carrier" value={table.filters.insurer_id ?? ""} onChange={(e) => table.setFilter("insurer_id", e.target.value)}>
              <option value="">Any carrier</option>
              {(meta.data?.insurers ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select aria-label="Status" value={table.filters.status ?? ""} onChange={(e) => table.setFilter("status", e.target.value)}>
              <option value="">Any status</option>
              {(meta.data?.appointmentStatuses ?? []).map((s) => <option key={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => open("new")}>Add appointment</button>
          </>
        }
      />
    </div>
  );
}

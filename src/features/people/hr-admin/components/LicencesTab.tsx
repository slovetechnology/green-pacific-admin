import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { api } from "@/shared/api/client";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import { useServerTable } from "../hooks/useServerTable";
import type { Licence } from "../lib/types";
import { ExpiryBadge, Notice } from "./Badges";
import { SelectField, TextField } from "./Fields";
import { ServerTable } from "./ServerTable";

const blank = { employee_id: "", licence_type: "NAICOM Individual Agent", licence_no: "", jurisdiction: "Nigeria", status: "Active", issued_on: "", expires_on: "", notes: "" };

// NAICOM / CIIN licences: who holds which, until when. Filter by status, type and "expiring within".
export function LicencesTab() {
  const meta = useHrMeta();
  const table = useServerTable<Licence>("/api/hr/licences", {}, [{ id: "expires", desc: false }]);
  const { run, notice, busy } = useAction();
  const [editing, setEditing] = useState<Licence | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function open(l: Licence | "new") {
    setEditing(l);
    setForm(l === "new" ? blank : { employee_id: String(l.employee_id), licence_type: l.licence_type, licence_no: l.licence_no, jurisdiction: l.jurisdiction, status: l.status, issued_on: l.issued_on ?? "", expires_on: l.expires_on ?? "", notes: l.notes ?? "" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isNew = editing === "new";
    const ok = await run(
      () => (isNew ? api.post("/api/hr/licences", form) : api.put(`/api/hr/licences/${(editing as Licence).id}`, form)),
      isNew ? "Licence added." : "Licence updated."
    );
    if (ok !== undefined) setEditing(null);
  }

  const columns = useMemo<ColumnDef<Licence, unknown>[]>(
    () => [
      { id: "employee", header: "Person", cell: ({ row }) => <><strong>{row.original.employee_name}</strong> <small>{row.original.staff_no}</small></> },
      { id: "type", header: "Licence", cell: ({ row }) => row.original.licence_type },
      { id: "number", header: "Number", cell: ({ row }) => row.original.licence_no },
      { id: "jurisdiction", header: "Jurisdiction", enableSorting: false, cell: ({ row }) => row.original.jurisdiction },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      { id: "expires", header: "Expiry", cell: ({ row }) => <ExpiryBadge band={row.original.band} date={row.original.expires_on} /> },
      {
        id: "actions", header: "", enableSorting: false,
        cell: ({ row }) => (
          <span className="hr-actions">
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => open(row.original)}>Edit</button>
            <button
              type="button" className="btn-secondary btn btn-sm"
              onClick={() => confirmAction(`Remove ${row.original.licence_type} ${row.original.licence_no}?`) && run(() => api.delete(`/api/hr/licences/${row.original.id}`), "Licence removed.")}
            >
              Remove
            </button>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      <Notice notice={notice} />
      {editing && (
        <form className="card hr-form" onSubmit={submit}>
          <h2>{editing === "new" ? "Add a licence" : "Edit licence"}</h2>
          <div className="form-grid">
            {editing === "new" && (
              <SelectField label="Person" required value={form.employee_id} onChange={set("employee_id")} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
            )}
            <SelectField label="Licence type" required blank={null} value={form.licence_type} onChange={set("licence_type")} options={(meta.data?.licenceTypes ?? []).map((t) => ({ value: t, label: t }))} />
            <TextField label="Licence number" required value={form.licence_no} onChange={set("licence_no")} />
            <TextField label="Jurisdiction" value={form.jurisdiction} onChange={set("jurisdiction")} hint="Nigeria, or the state where relevant." />
            <SelectField label="Status" blank={null} value={form.status} onChange={set("status")} options={(meta.data?.licenceStatuses ?? []).map((t) => ({ value: t, label: t }))} />
            <TextField label="Issued on" type="date" value={form.issued_on} onChange={set("issued_on")} />
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
        emptyMessage="No licences match."
        rowClassName={(r) => (r.band === "expired" ? "hr-row-alert" : undefined)}
        toolbar={
          <>
            <select aria-label="Status" value={table.filters.status ?? ""} onChange={(e) => table.setFilter("status", e.target.value)}>
              <option value="">Any status</option>
              {(meta.data?.licenceStatuses ?? []).map((s) => <option key={s}>{s}</option>)}
            </select>
            <select aria-label="Licence type" value={table.filters.type ?? ""} onChange={(e) => table.setFilter("type", e.target.value)}>
              <option value="">Any type</option>
              {(meta.data?.licenceTypes ?? []).map((s) => <option key={s}>{s}</option>)}
            </select>
            <select aria-label="Expiring within" value={table.filters.expiring_within ?? ""} onChange={(e) => table.setFilter("expiring_within", e.target.value)}>
              <option value="">Any expiry</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
            </select>
            <button type="button" className="btn btn-sm" onClick={() => open("new")}>Add licence</button>
          </>
        }
      />
    </div>
  );
}

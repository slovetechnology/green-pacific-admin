import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { api } from "@/shared/api/client";
import { useAction, useHrMeta } from "../hooks/useHrApi";
import { useServerTable } from "../hooks/useServerTable";
import type { EoPolicy } from "../lib/types";
import { ExpiryBadge, Notice } from "./Badges";
import { SelectField, TextField, money } from "./Fields";
import { ServerTable } from "./ServerTable";
import { confirmDialog } from "@/shared/components/Dialogs";

const blank = {
  scope: "Individual", employee_id: "", insurer_name: "", policy_no: "", limit_per_claim: "", aggregate_limit: "", deductible: "", premium: "",
  retroactive_date: "", starts_on: "", expires_on: "", status: "Active", notes: "",
};

// Errors & Omissions (professional indemnity) cover: the firm's policy and each producer's own.
export function EoTab() {
  const meta = useHrMeta();
  const table = useServerTable<EoPolicy>("/api/hr/eo-policies", {}, [{ id: "expires", desc: false }]);
  const { run, notice, busy } = useAction();
  const [editing, setEditing] = useState<EoPolicy | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function open(p: EoPolicy | "new") {
    setEditing(p);
    setForm(p === "new" ? blank : {
      scope: p.scope, employee_id: p.employee_id ? String(p.employee_id) : "", insurer_name: p.insurer_name ?? "", policy_no: p.policy_no, limit_per_claim: String(p.limit_per_claim),
      aggregate_limit: String(p.aggregate_limit), deductible: String(p.deductible), premium: String(p.premium), retroactive_date: p.retroactive_date ?? "", starts_on: p.starts_on,
      expires_on: p.expires_on, status: p.status, notes: p.notes ?? "",
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isNew = editing === "new";
    const ok = await run(() => (isNew ? api.post("/api/hr/eo-policies", form) : api.put(`/api/hr/eo-policies/${(editing as EoPolicy).id}`, form)), isNew ? "Policy added." : "Policy updated.");
    if (ok !== undefined) setEditing(null);
  }

  const columns = useMemo<ColumnDef<EoPolicy, unknown>[]>(
    () => [
      { id: "scope", header: "Cover", cell: ({ row }) => (row.original.scope === "Firm" ? <strong>Firm-wide</strong> : row.original.employee_name) },
      { id: "policy", header: "Policy no.", cell: ({ row }) => <>{row.original.policy_no}<div><small>{row.original.insurer_name}</small></div></> },
      { id: "limit", header: "Per claim", meta: { num: true }, cell: ({ row }) => money(row.original.limit_per_claim) },
      { id: "aggregate", header: "Aggregate", enableSorting: false, meta: { num: true }, cell: ({ row }) => money(row.original.aggregate_limit) },
      { id: "retro", header: "Retro date", enableSorting: false, cell: ({ row }) => row.original.retroactive_date ?? "—" },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      { id: "expires", header: "Expiry", cell: ({ row }) => <ExpiryBadge band={row.original.band} date={row.original.expires_on} /> },
      {
        id: "actions", header: "", enableSorting: false,
        cell: ({ row }) => (
          <span className="hr-actions">
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => open(row.original)}>Edit</button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={async () => (await confirmDialog(`Remove policy ${row.original.policy_no}?`)) && run(() => api.delete(`/api/hr/eo-policies/${row.original.id}`), "Policy removed.")}>Remove</button>
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
          <h2>{editing === "new" ? "Add an E&O policy" : "Edit E&O policy"}</h2>
          <div className="form-grid">
            <SelectField label="Cover for" blank={null} value={form.scope} onChange={set("scope")} options={[{ value: "Individual", label: "One person" }, { value: "Firm", label: "The whole firm" }]} />
            {form.scope === "Individual" && (
              <SelectField label="Person" required value={form.employee_id} onChange={set("employee_id")} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
            )}
            <TextField label="Insurer" value={form.insurer_name} onChange={set("insurer_name")} />
            <TextField label="Policy number" required value={form.policy_no} onChange={set("policy_no")} />
            <TextField label="Limit per claim (₦)" type="number" step="any" required value={form.limit_per_claim} onChange={set("limit_per_claim")} />
            <TextField label="Aggregate limit (₦)" type="number" step="any" value={form.aggregate_limit} onChange={set("aggregate_limit")} hint="Blank = same as per claim." />
            <TextField label="Deductible (₦)" type="number" step="any" value={form.deductible} onChange={set("deductible")} />
            <TextField label="Premium (₦)" type="number" step="any" value={form.premium} onChange={set("premium")} />
            <TextField label="Retroactive date" type="date" value={form.retroactive_date} onChange={set("retroactive_date")} hint="Business written before this date is not covered." />
            <TextField label="Starts on" type="date" required value={form.starts_on} onChange={set("starts_on")} />
            <TextField label="Expires on" type="date" required value={form.expires_on} onChange={set("expires_on")} />
            <SelectField label="Status" blank={null} value={form.status} onChange={set("status")} options={(meta.data?.eoStatuses ?? []).map((t) => ({ value: t, label: t }))} />
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
        emptyMessage="No E&O policies on file."
        toolbar={
          <>
            <select aria-label="Cover for" value={table.filters.scope ?? ""} onChange={(e) => table.setFilter("scope", e.target.value)}>
              <option value="">Firm and individual</option>
              <option value="Firm">Firm only</option>
              <option value="Individual">Individual only</option>
            </select>
            <select aria-label="Status" value={table.filters.status ?? ""} onChange={(e) => table.setFilter("status", e.target.value)}>
              <option value="">Any status</option>
              {(meta.data?.eoStatuses ?? []).map((s) => <option key={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => open("new")}>Add policy</button>
          </>
        }
      />
    </div>
  );
}

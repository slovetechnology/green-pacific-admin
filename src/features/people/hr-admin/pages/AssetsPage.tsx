import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Notice } from "../components/Badges";
import { SelectField, TextField, money, today } from "../components/Fields";
import { ServerTable } from "../components/ServerTable";
import { useAction } from "../hooks/useHrApi";
import { useServerTable } from "../hooks/useServerTable";
import type { Asset } from "../lib/types";
import "../hr-admin.css";

interface AssetMeta {
  categories: string[];
  statuses: string[];
  employees: { id: number; staff_no: string; full_name: string }[];
}

const blank = { asset_tag: "", category: "Laptop", make: "", model: "", serial_no: "", purchase_date: "", purchase_cost: "", notes: "" };

// Hardware register: laptops and screens issued to remote and hybrid staff, who holds each, and its history.
export function AssetsPage() {
  const meta = useQuery({ queryKey: ["hr", "assets-meta"], queryFn: () => api.get<AssetMeta>("/api/hr-admin/assets/meta"), staleTime: 60_000 });
  const table = useServerTable<Asset>("/api/hr-admin/assets", {}, [{ id: "tag", desc: false }]);
  const { run, notice, busy } = useAction();
  const [form, setForm] = useState<typeof blank | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<Asset | null>(null);
  const [holder, setHolder] = useState({ employee_id: "", assigned_on: today(), condition_out: "" });
  const [returning, setReturning] = useState<Asset | null>(null);
  const [back, setBack] = useState({ returned_on: today(), status: "In Stock", condition_in: "" });

  const columns = useMemo<ColumnDef<Asset, unknown>[]>(
    () => [
      { id: "tag", header: "Tag", cell: ({ row }) => <strong>{row.original.asset_tag}</strong> },
      { id: "category", header: "Type", cell: ({ row }) => row.original.category },
      { id: "item", header: "Item", enableSorting: false, cell: ({ row }) => [row.original.make, row.original.model].filter(Boolean).join(" ") || "—" },
      { id: "serial", header: "Serial", cell: ({ row }) => row.original.serial_no ?? "—" },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      { id: "holder", header: "Held by", enableSorting: false, cell: ({ row }) => (row.original.holder_name ? <>{row.original.holder_name} <small>since {row.original.held_since}</small></> : "—") },
      { id: "purchased", header: "Cost", meta: { num: true }, cell: ({ row }) => money(row.original.purchase_cost) },
      {
        id: "actions", header: "", enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <span className="hr-actions">
              {a.status === "In Stock" && <button type="button" className="btn btn-sm" onClick={() => { setAssigning(a); setReturning(null); }}>Assign</button>}
              {a.status === "Assigned" && <button type="button" className="btn btn-sm" onClick={() => { setReturning(a); setAssigning(null); }}>Return</button>}
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setEditId(a.id); setForm({ asset_tag: a.asset_tag, category: a.category, make: a.make ?? "", model: a.model ?? "", serial_no: a.serial_no ?? "", purchase_date: a.purchase_date ?? "", purchase_cost: a.purchase_cost === null ? "" : String(a.purchase_cost), notes: a.notes ?? "" }); }}>Edit</button>
            </span>
          );
        },
      },
    ],
    []
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => (editId ? api.put(`/api/hr-admin/assets/${editId}`, form) : api.post("/api/hr-admin/assets", form)), editId ? "Asset updated." : "Asset registered.");
    if (ok !== undefined) { setForm(null); setEditId(null); }
  }
  async function assign(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post(`/api/hr-admin/assets/${assigning!.id}/assign`, holder), "Asset assigned.");
    if (ok !== undefined) setAssigning(null);
  }
  async function giveBack(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.post(`/api/hr-admin/assets/${returning!.id}/return`, back), "Return recorded.");
    if (ok !== undefined) setReturning(null);
  }

  const f = form;
  const setF = (k: keyof typeof blank) => (v: string) => setForm((cur) => (cur ? { ...cur, [k]: v } : cur));

  return (
    <div className="hr-page">
      <div className="page-header"><h1>Corporate assets</h1></div>
      <Notice notice={notice} />
      {f && (
        <form className="card hr-form" onSubmit={save}>
          <h2>{editId ? "Edit asset" : "Register an asset"}</h2>
          <div className="form-grid">
            <TextField label="Asset tag" required value={f.asset_tag} onChange={setF("asset_tag")} />
            <SelectField label="Type" blank={null} value={f.category} onChange={setF("category")} options={(meta.data?.categories ?? []).map((c) => ({ value: c, label: c }))} />
            <TextField label="Make" value={f.make} onChange={setF("make")} />
            <TextField label="Model" value={f.model} onChange={setF("model")} />
            <TextField label="Serial number" value={f.serial_no} onChange={setF("serial_no")} />
            <TextField label="Purchased" type="date" value={f.purchase_date} onChange={setF("purchase_date")} />
            <TextField label="Cost (₦)" type="number" step="any" value={f.purchase_cost} onChange={setF("purchase_cost")} />
            <TextField label="Notes" value={f.notes} onChange={setF("notes")} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>Save</button>
            <button type="button" className="btn-secondary btn" onClick={() => { setForm(null); setEditId(null); }}>Cancel</button>
          </div>
        </form>
      )}
      {assigning && (
        <form className="card hr-form" onSubmit={assign}>
          <h2>Assign {assigning.asset_tag}</h2>
          <div className="form-grid">
            <SelectField label="Person" required value={holder.employee_id} onChange={(v) => setHolder({ ...holder, employee_id: v })} options={(meta.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.staff_no})` }))} />
            <TextField label="Date" type="date" required value={holder.assigned_on} onChange={(v) => setHolder({ ...holder, assigned_on: v })} />
            <TextField label="Condition" value={holder.condition_out} onChange={(v) => setHolder({ ...holder, condition_out: v })} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>Assign</button>
            <button type="button" className="btn-secondary btn" onClick={() => setAssigning(null)}>Cancel</button>
          </div>
        </form>
      )}
      {returning && (
        <form className="card hr-form" onSubmit={giveBack}>
          <h2>Return {returning.asset_tag} from {returning.holder_name}</h2>
          <div className="form-grid">
            <TextField label="Returned on" type="date" required value={back.returned_on} onChange={(v) => setBack({ ...back, returned_on: v })} />
            <SelectField label="It goes to" blank={null} value={back.status} onChange={(v) => setBack({ ...back, status: v })} options={["In Stock", "Under Repair", "Retired", "Lost"].map((s) => ({ value: s, label: s }))} />
            <TextField label="Condition" value={back.condition_in} onChange={(v) => setBack({ ...back, condition_in: v })} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>Record return</button>
            <button type="button" className="btn-secondary btn" onClick={() => setReturning(null)}>Cancel</button>
          </div>
        </form>
      )}
      <ServerTable
        table={table}
        columns={columns}
        getRowKey={(r) => r.id}
        emptyMessage="No assets registered."
        toolbar={
          <>
            <select aria-label="Type" value={table.filters.category ?? ""} onChange={(e) => table.setFilter("category", e.target.value)}>
              <option value="">Any type</option>
              {(meta.data?.categories ?? []).map((c) => <option key={c}>{c}</option>)}
            </select>
            <select aria-label="Status" value={table.filters.status ?? ""} onChange={(e) => table.setFilter("status", e.target.value)}>
              <option value="">Any status</option>
              {(meta.data?.statuses ?? []).map((c) => <option key={c}>{c}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={() => { setEditId(null); setForm(blank); }}>Register asset</button>
          </>
        }
      />
    </div>
  );
}

import { useRef, useState } from "react";
import { api, apiUrl, ApiError } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { ItemScheduleModal } from "./schedules/ItemScheduleModal";
import type { ScheduleValue } from "./schedules/types";

// Schedule of risks on the transaction form: a fleet of vehicles (motor), a schedule of property
// (non-motor) or a list of insured persons (group / individual life). Rows can be typed in, added
// one at a time, or loaded from an .xlsx file; the parent sends them with the transaction.

export type RiskKind = "vehicle" | "property" | "life";
// A row's `schedule` is the class schedule (Fidelity Guarantee, Public Liability, Boilers) it was
// completed from; its total is the row's sum insured.
export interface RiskRow {
  _k: string;
  schedule?: ScheduleValue | null;
  [key: string]: string | ScheduleValue | null | undefined;
}
const str = (row: RiskRow, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");

export const SUM_ASSURED_MULTIPLE = 3;

let counter = 0;
export function newRow(init: Record<string, unknown> = {}): RiskRow {
  const row: RiskRow = { _k: `r${(counter += 1)}` };
  for (const [k, v] of Object.entries(init)) {
    if (k === "schedule") row.schedule = (v as ScheduleValue | null) ?? null;
    else row[k] = v === null || v === undefined ? "" : String(v);
  }
  return row;
}

interface Column {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "category" | "textarea";
  width?: string;
}

const COLUMNS: Record<RiskKind, Column[]> = {
  vehicle: [
    { key: "vehicle_make", label: "Make of vehicle" },
    { key: "registration_no", label: "Registration number" },
    { key: "engine_no", label: "Engine number" },
    { key: "chassis_no", label: "Chassis number" },
    { key: "item_value", label: "Value", type: "number" },
  ],
  property: [
    { key: "property_category", label: "Category of property", type: "category" },
    { key: "property_description", label: "Description of property", type: "textarea", width: "22rem" },
    { key: "item_value", label: "Sum insured / limit of liability", type: "number" },
    { key: "risk_location", label: "Risk location" },
  ],
  life: [
    { key: "insured_name", label: "Name of insured person" },
    { key: "date_of_birth", label: "Date of birth", type: "date" },
    { key: "annual_earning", label: "Annual earning", type: "number" },
    { key: "item_value", label: `Sum assured (${SUM_ASSURED_MULTIPLE} × annual earning)`, type: "number" },
    { key: "nin", label: "NIN" },
  ],
};

const TITLES: Record<RiskKind, { heading: string; unit: string; add: string; note?: string }> = {
  vehicle: { heading: "Risk information — motor", unit: "vehicle", add: "Add vehicle", note: "Add a row for each vehicle in a fleet." },
  property: { heading: "Risk information — non-motor", unit: "item", add: "Add property", note: "Add a row for each item on the schedule of property." },
  life: { heading: "Risk information — life", unit: "person", add: "Add person", note: "One row per insured person. The sum assured fills in at 3 × annual earning and can be overtyped. NIN is 11 digits." },
};

export function rowValue(row: RiskRow): number {
  return parseFloat(str(row, "item_value").replace(/,/g, "")) || 0;
}

interface Props {
  kind: RiskKind;
  rows: RiskRow[];
  onChange: (rows: RiskRow[]) => void;
  propertyCategories: string[];
  // Property category -> the class schedule it opens (from the server).
  categorySchedules?: Record<string, string>;
}

export function RiskSchedule({ kind, rows, onChange, propertyCategories, categorySchedules = {} }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string; errors: string[] } | null>(null);
  const columns = COLUMNS[kind];
  const title = TITLES[kind];
  const valueCol = columns.findIndex((c) => c.key === "item_value");
  const total = rows.reduce((sum, r) => sum + rowValue(r), 0);

  function update(index: number, key: string, value: string) {
    onChange(
      rows.map((row, i) => {
        if (i !== index) return row;
        const next: RiskRow = { ...row, [key]: value };
        // Moving off a schedule category drops its schedule; moving onto one starts it blank.
        if (key === "property_category") {
          if (!categorySchedules[value]) next.schedule = null;
          else if (categorySchedules[value] !== (row.schedule?.classKey)) { next.schedule = null; next.item_value = ""; }
        }
        // Sum assured follows 3 × annual earning until the user types their own figure.
        if (kind === "life" && key === "annual_earning") {
          const old = (parseFloat(str(row, "annual_earning")) || 0) * SUM_ASSURED_MULTIPLE;
          const current = parseFloat(str(row, "item_value")) || 0;
          if (!str(row, "item_value") || current === old) {
            const sum = (parseFloat(value) || 0) * SUM_ASSURED_MULTIPLE;
            next.item_value = sum ? String(sum) : "";
          }
        }
        return next;
      })
    );
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setImportMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<{ items: Record<string, unknown>[]; errors: string[] }>(
        `/api/transactions-import/risk-items/parse?kind=${kind}`,
        form
      );
      const imported = result.items.map((item) => newRow(item));
      // Replace the starter blank row, otherwise append to what is already there.
      const kept = rows.filter((r) => columns.some((c) => str(r, c.key)));
      onChange([...kept, ...imported]);
      setImportMsg({
        ok: result.errors.length === 0,
        text: `${imported.length} ${title.unit}${imported.length === 1 ? "" : "s"} loaded from ${file.name}.${result.errors.length ? ` ${result.errors.length} row(s) skipped:` : ""}`,
        errors: result.errors.slice(0, 20),
      });
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not read that file.", errors: [] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <div className="section-title">{title.heading}</div>
      <p className="page-lede" style={{ marginTop: 0 }}>{title.note}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, newRow()])}>
          + {title.add}
        </button>
        <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Importing…" : "Import from Excel"}
        </button>
        <a className="btn-secondary btn-sm" href={apiUrl(`/api/transactions-import/risk-items/template?kind=${kind}`)}>
          Download template
        </a>
        {rows.length > 0 && (
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => onChange([])}>
            Clear all
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
      </div>
      {importMsg && (
        <div className={`flash ${importMsg.ok ? "flash-success" : "flash-warning"}`}>
          {importMsg.text}
          {importMsg.errors.length > 0 && (
            <ul>
              {importMsg.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} style={{ textAlign: "center", opacity: 0.7 }}>
                  No {title.unit}s yet. Add a row or import a file.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row._k}>
                <td>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} style={c.width ? { minWidth: c.width } : { minWidth: "9rem" }}>
                    {c.type === "category" ? (
                      <select aria-label={c.label} value={str(row, c.key)} onChange={(e) => { update(i, c.key, e.target.value); if (categorySchedules[e.target.value]) setEditing(i); }}>
                        <option value="">— Select —</option>
                        {/* A saved value outside the list (older free-text data) stays selectable. */}
                        {str(row, c.key) && !propertyCategories.includes(str(row, c.key)) && <option value={str(row, c.key)}>{str(row, c.key)}</option>}
                        {propertyCategories.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : c.type === "textarea" ? (
                      <textarea aria-label={c.label} rows={2} value={str(row, c.key)} onChange={(e) => update(i, c.key, e.target.value)} />
                    ) : c.key === "item_value" && categorySchedules[str(row, "property_category")] ? (
                      // The sum insured of a schedule category is the total of its schedule.
                      <div className="sch-cell">
                        <strong>{row.schedule ? fmtMoney(rowValue(row)) : "—"}</strong>
                        <button type="button" className="btn-secondary btn btn-sm" onClick={() => setEditing(i)}>
                          {row.schedule ? "Edit schedule" : "Complete schedule"}
                        </button>
                        {!row.schedule && <span className="sch-error">Schedule not completed</span>}
                      </div>
                    ) : (
                      <input
                        aria-label={c.label}
                        type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                        step={c.type === "number" ? "0.01" : undefined}
                        min={c.type === "number" ? 0 : undefined}
                        max={c.type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
                        inputMode={c.key === "nin" ? "numeric" : undefined}
                        maxLength={c.key === "nin" ? 11 : undefined}
                        value={str(row, c.key)}
                        onChange={(e) => update(i, c.key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td>
                  <button type="button" className="btn-secondary btn btn-sm" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={valueCol + 1} style={{ textAlign: "right" }}>
                  <strong>
                    {rows.length} {title.unit}
                    {rows.length === 1 ? "" : "s"} · Total {kind === "life" ? "sum assured" : kind === "vehicle" ? "value" : "sum insured"}
                  </strong>
                </td>
                <td colSpan={columns.length - valueCol + 1}>
                  <strong>{fmtMoney(total)}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {editing !== null && rows[editing] && categorySchedules[str(rows[editing], "property_category")] && (
        <ItemScheduleModal
          open
          specKey={categorySchedules[str(rows[editing], "property_category")]}
          initial={rows[editing].schedule ?? null}
          onClose={() => setEditing(null)}
          onSave={(schedule, total) => {
            onChange(rows.map((r, j) => (j === editing ? { ...r, schedule, item_value: String(total) } : r)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

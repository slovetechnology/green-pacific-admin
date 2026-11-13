import "@/shared/styles/schedules.css";
import { fmtMoney } from "@/shared/lib/format";
import { conditionHolds } from "./resolveSchedule";
import { useScheduleSpec, useScheduleSpecs } from "./useScheduleSpecs";
import type { FieldSpec, ScheduleData, ScheduleSpec } from "./types";

interface Props {
  classOfBusiness: string;
  riskSchedule: { classKey: string; data: ScheduleData } | null;
}

const NUMERIC = new Set(["money", "number", "int"]);
const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function display(field: FieldSpec, value: unknown): string {
  if (field.type === "boolean") return value === true ? "Yes" : "No";
  if (blank(value)) return "—";
  if (field.type === "money") return fmtMoney(value);
  if (field.type === "number" || field.type === "int") return Number(value).toLocaleString("en-NG");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function ListTable({ field, rows }: { field: FieldSpec; rows: ScheduleData[] }) {
  const columns = field.fields ?? [];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {columns.map((c) => <th key={c.key} className={NUMERIC.has(c.type) ? "num" : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {columns.map((c) => <td key={c.key} className={NUMERIC.has(c.type) ? "num" : undefined}>{display(c, row[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sections({ spec, data }: { spec: ScheduleSpec; data: ScheduleData }) {
  return (
    <>
      {spec.sections.map((section) => {
        const fields = section.fields.filter((f) => conditionHolds(f.showWhen, data));
        const scalars = fields.filter((f) => f.type !== "list");
        const lists = fields.filter((f) => f.type === "list" && Array.isArray(data[f.key]) && (data[f.key] as unknown[]).length);
        if (!scalars.length && !lists.length) return null;
        return (
          <div key={section.title}>
            <div className="section-title">{section.title}</div>
            {scalars.length > 0 && (
              <div className="detail-grid">
                {scalars.map((f) => (
                  <div key={f.key}>
                    <div className="k">{f.label}</div>
                    <div className={`v${NUMERIC.has(f.type) ? " sch-num" : ""}`}>{display(f, data[f.key])}</div>
                  </div>
                ))}
              </div>
            )}
            {lists.map((f) => (
              <div key={f.key}>
                <div className="sch-list-label">{f.label}</div>
                <ListTable field={f} rows={data[f.key] as ScheduleData[]} />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// Read-only view of a policy's class-specific risk schedule, for the transaction detail page. Shows
// nothing for a class that has no schedule; for one that has, says so when none is recorded yet
// (older policies predate schedules).
export function ScheduleView({ classOfBusiness, riskSchedule }: Props) {
  const specs = useScheduleSpecs().data;
  const classSpec = useScheduleSpec(classOfBusiness);
  const spec = riskSchedule ? (specs?.find((s) => s.key === riskSchedule.classKey) ?? null) : classSpec;
  if (!spec) return null;
  const recorded = riskSchedule && riskSchedule.classKey === classSpec?.key;

  return (
    <div className="card">
      <div className="sch-head">
        <h2>Risk schedule — {spec.label}</h2>
        {spec.authority && <span className="badge badge-secondary">{spec.authority}</span>}
      </div>
      {recorded && riskSchedule ? <Sections spec={spec} data={riskSchedule.data} /> : (
        <p className="text-muted">No risk schedule has been recorded for this policy. Edit the transaction to add one.</p>
      )}
    </div>
  );
}

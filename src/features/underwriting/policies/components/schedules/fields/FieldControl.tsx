import { ListField } from "./ListField";
import { MultiSelectField } from "./MultiSelectField";
import { conditionHolds } from "../resolveSchedule";
import type { FieldSpec, ScheduleData, ScheduleErrors } from "../types";

interface Props {
  field: FieldSpec;
  scope: ScheduleData; // the object the field sits in (the schedule, or one list row)
  onChange: (key: string, value: unknown) => void;
  errors: ScheduleErrors;
  path: string; // path of the parent: "" at the top, "containers[0]" inside a row
  disabled?: boolean;
  idPrefix: string;
  compact?: boolean; // inside a list row: no label above, the column header carries it
}

// One schedule field, drawn by type. Wide controls (text areas, lists, multi-selects) span two columns.
export function FieldControl({ field, scope, onChange, errors, path, disabled, idPrefix, compact }: Props) {
  if (field.showWhen && !conditionHolds(field.showWhen, scope)) return null;
  const here = path ? `${path}.${field.key}` : field.key;
  const id = `${idPrefix}-${here.replace(/[^a-z0-9]+/gi, "-")}`;
  const error = errors[here];
  const required = field.required || (field.requiredWhen !== undefined && conditionHolds(field.requiredWhen, scope));
  const value = scope[field.key];
  const set = (v: unknown) => onChange(field.key, v);
  const invalid = error ? true : undefined;
  const wide = !compact && (field.type === "textarea" || field.type === "list" || field.type === "multiselect");

  let control;
  switch (field.type) {
    case "textarea":
      control = <textarea id={id} rows={3} value={String(value ?? "")} onChange={(e) => set(e.target.value)} disabled={disabled} aria-invalid={invalid} />;
      break;
    case "money":
    case "number":
    case "int":
      control = (
        <input id={id} type="number" inputMode="decimal" step={field.type === "int" ? 1 : "any"} min={field.min} max={field.max}
          className="sch-num" value={String(value ?? "")} onChange={(e) => set(e.target.value)} disabled={disabled} aria-invalid={invalid} />
      );
      break;
    case "date":
      control = <input id={id} type="date" max={field.notFuture ? new Date().toISOString().slice(0, 10) : undefined} value={String(value ?? "")} onChange={(e) => set(e.target.value)} disabled={disabled} aria-invalid={invalid} />;
      break;
    case "select":
      control = (
        <select id={id} value={String(value ?? "")} onChange={(e) => set(e.target.value)} disabled={disabled} aria-invalid={invalid}>
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "multiselect":
      control = <MultiSelectField id={id} options={field.options ?? []} value={Array.isArray(value) ? (value as string[]) : []} onChange={set} disabled={disabled} invalid={Boolean(error)} />;
      break;
    case "boolean":
      return (
        <div className="field sch-check">
          <label htmlFor={id}>
            <input id={id} type="checkbox" checked={value === true || value === "true"} onChange={(e) => set(e.target.checked)} disabled={disabled} />
            <span>{field.label}</span>
          </label>
        </div>
      );
    case "list":
      control = <ListField field={field} rows={Array.isArray(value) ? (value as ScheduleData[]) : []} onChange={set} errors={errors} path={here} disabled={disabled} idPrefix={idPrefix} />;
      break;
    default:
      control = <input id={id} type="text" value={String(value ?? "")} onChange={(e) => set(e.target.value)} disabled={disabled} aria-invalid={invalid} />;
  }

  if (compact) {
    return <div className="sch-cell">{control}{error && <small className="sch-error" role="alert">{error}</small>}</div>;
  }
  return (
    <div className={`field${wide ? " span-2" : ""}`}>
      {field.type === "list" ? (
        <span className="sch-list-label">{field.label}{required || field.minItems ? <span className="sch-req" aria-hidden="true"> *</span> : null}</span>
      ) : (
        <label htmlFor={id}>{field.label}{required && <span className="sch-req" aria-hidden="true"> *</span>}</label>
      )}
      {control}
      {field.help && <small className="field-hint">{field.help}</small>}
      {error && <small className="sch-error" role="alert">{error}</small>}
    </div>
  );
}

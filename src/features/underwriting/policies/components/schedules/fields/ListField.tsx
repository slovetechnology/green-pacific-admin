import { FieldControl } from "./FieldControl";
import type { FieldSpec, ScheduleData, ScheduleErrors } from "../types";

interface Props {
  field: FieldSpec;
  rows: ScheduleData[];
  onChange: (rows: ScheduleData[]) => void;
  errors: ScheduleErrors;
  path: string;
  disabled?: boolean;
  idPrefix: string;
}

const NUMERIC = new Set(["money", "number", "int"]);

// A repeating group (containers, locations, equipment, ...) drawn as a table with a header row,
// "Add row" and a remove button per row. An empty list shows one blank row so the fields are there.
export function ListField({ field, rows, onChange, errors, path, disabled, idPrefix }: Props) {
  const columns = field.fields ?? [];
  const visible = rows.length ? rows : [{}];
  const update = (index: number, key: string, value: unknown) =>
    onChange(visible.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const remove = (index: number) => onChange(visible.filter((_, i) => i !== index));

  return (
    <div className="table-wrap sch-list">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={NUMERIC.has(c.type) ? "num" : undefined}>
                {c.label}{c.required ? <span className="sch-req" aria-hidden="true"> *</span> : null}
              </th>
            ))}
            <th className="actions-row"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => (
            <tr key={index}>
              {columns.map((c) => (
                <td key={c.key} className={NUMERIC.has(c.type) ? "num" : undefined}>
                  <FieldControl field={c} scope={row} onChange={(k, v) => update(index, k, v)} errors={errors} path={`${path}[${index}]`}
                    disabled={disabled} idPrefix={idPrefix} compact />
                </td>
              ))}
              <td className="actions-row">
                <button type="button" className="btn-secondary btn-sm" onClick={() => remove(index)} disabled={disabled || (visible.length === 1 && !Object.keys(row).length)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!field.maxItems || visible.length < field.maxItems) && (
        <button type="button" className="btn-secondary btn-sm sch-add" onClick={() => onChange([...visible, {}])} disabled={disabled}>
          Add row
        </button>
      )}
    </div>
  );
}

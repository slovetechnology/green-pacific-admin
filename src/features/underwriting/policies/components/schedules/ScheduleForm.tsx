import "@/shared/styles/schedules.css";
import { FieldControl } from "./fields/FieldControl";
import type { ScheduleData, ScheduleErrors, ScheduleSpec } from "./types";

interface Props {
  spec: ScheduleSpec;
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
  errors: ScheduleErrors;
  disabled?: boolean;
}

// The generic sub-form: every section of a spec as a titled group of fields on a responsive grid.
// All 23 classes render through this; a class that needs its own layout registers a component in
// ./overrides instead (see ScheduleSwitcher).
export function ScheduleForm({ spec, data, onChange, errors, disabled }: Props) {
  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });
  return (
    <div className="sch-sections">
      {spec.sections.map((section) => (
        <fieldset key={section.title} className="sch-section">
          <legend>{section.title}</legend>
          {section.hint && <p className="field-hint">{section.hint}</p>}
          <div className="form-grid">
            {section.fields.map((field) => (
              <FieldControl key={field.key} field={field} scope={data} onChange={set} errors={errors} path="" disabled={disabled} idPrefix={`sch-${spec.key}`} />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

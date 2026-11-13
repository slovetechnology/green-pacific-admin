import { ScheduleForm } from "./ScheduleForm";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { SCHEDULE_OVERRIDES } from "./overrides";
import { useScheduleSpec } from "./useScheduleSpecs";
import type { ScheduleData, ScheduleErrors, ScheduleValue } from "./types";

interface Props {
  classOfBusiness: string;
  value: ScheduleValue | null;
  onChange: (value: ScheduleValue) => void;
  errors: ScheduleErrors;
  disabled?: boolean;
}

// The master switcher: looks at the selected class of business and mounts the matching sub-form, or
// nothing when the class has no schedule (motor, life, free-text classes). A value saved for another
// class is never shown under this one; the form starts empty and reports its own class key.
export function ScheduleSwitcher({ classOfBusiness, value, onChange, errors, disabled }: Props) {
  const spec = useScheduleSpec(classOfBusiness);
  if (!spec) return null;
  const data: ScheduleData = value?.classKey === spec.key ? value.data : {};
  const Form = SCHEDULE_OVERRIDES[spec.key] ?? ScheduleForm;
  const problems = Object.keys(errors).length;

  return (
    <section className="sch-card" aria-labelledby="sch-heading">
      <header className="sch-head">
        <h3 id="sch-heading">Risk schedule — {spec.label}</h3>
        {spec.authority && <span className="badge badge-secondary">{spec.authority}</span>}
      </header>
      <ScheduleToolbar spec={spec} data={data} disabled={disabled} onChange={(next) => onChange({ classKey: spec.key, data: next })} />
      <p className="field-hint">Fields marked <span className="sch-req">*</span> are mandatory for this class.</p>
      {problems > 0 && <div className="alert alert-danger" role="alert">{problems} {problems === 1 ? "field needs" : "fields need"} attention in this schedule.</div>}
      <Form spec={spec} data={data} errors={errors} disabled={disabled} onChange={(next) => onChange({ classKey: spec.key, data: next })} />
    </section>
  );
}

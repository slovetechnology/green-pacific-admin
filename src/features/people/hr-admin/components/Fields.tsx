import { useId, type ReactNode } from "react";

// Small labelled inputs for the HR forms, controlled by the caller's state object.
export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small className="hr-hint">{hint}</small>}
    </div>
  );
}

export function TextField({ label, value, onChange, type = "text", required, hint, placeholder, step }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  step?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} type={type} value={value} required={required} placeholder={placeholder} step={step} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, required, blank = "Choose…" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  required?: boolean;
  blank?: string | null;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
          {blank !== null && <option value="">{blank}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
export const pct = (fraction: number) => `${+(fraction * 100).toFixed(2)}%`;
export const today = () => new Date().toISOString().slice(0, 10);

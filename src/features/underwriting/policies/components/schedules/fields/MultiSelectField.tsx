interface Props {
  id: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

// A group of checkboxes for a "pick all that apply" field.
export function MultiSelectField({ id, options, value, onChange, disabled, invalid }: Props) {
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <div id={id} role="group" className={`sch-checks${invalid ? " is-invalid" : ""}`}>
      {options.map((option) => (
        <label key={option} className={value.includes(option) ? "is-on" : undefined}>
          <input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} disabled={disabled} />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

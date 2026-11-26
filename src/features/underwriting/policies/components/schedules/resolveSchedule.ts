import type { Condition, FieldSpec, ScheduleData, ScheduleErrors, ScheduleSpec } from "./types";

// Same normalisation as the backend's scheduleKeyFor: "Goods In Transit — Annual" and "goods in transit" match.
const norm = (name: string) =>
  name.split(/\s+[—–-]\s+/)[0].toLowerCase().replace(/&/g, "and").replace(/[’']/g, "").replace(/\s+/g, " ").trim();

export function findSchedule(specs: ScheduleSpec[] | undefined, classOfBusiness: string): ScheduleSpec | null {
  if (!specs || !classOfBusiness) return null;
  const wanted = norm(classOfBusiness);
  return specs.find((s) => s.classNames.some((n) => norm(n) === wanted)) ?? null;
}

const isTrue = (v: unknown) => v === true || v === 1 || v === "true" || v === "1";

export function conditionHolds(cond: Condition | undefined, scope: ScheduleData): boolean {
  if (!cond) return true;
  const v = scope[cond.field];
  if ("equals" in cond) return v === cond.equals;
  if (cond.in) return cond.in.includes(v);
  if (cond.truthy) return isTrue(v);
  if (cond.gt !== undefined) return Number(v) > cond.gt;
  return true;
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function checkFields(fields: FieldSpec[], scope: ScheduleData, path: string, errors: ScheduleErrors) {
  for (const field of fields) {
    if (field.showWhen && !conditionHolds(field.showWhen, scope)) continue;
    const here = path ? `${path}.${field.key}` : field.key;
    const required = field.required || (field.requiredWhen !== undefined && conditionHolds(field.requiredWhen, scope));
    const value = scope[field.key];
    if (field.type === "list") {
      const rows = (Array.isArray(value) ? value : []).filter((r) => r && Object.values(r as ScheduleData).some((v) => !blank(v) && v !== false));
      const min = field.minItems ?? (required ? 1 : 0);
      if (rows.length < min) errors[here] = `${field.label} needs at least ${min} ${min === 1 ? "row" : "rows"}.`;
      rows.forEach((row, i) => checkFields(field.fields ?? [], row as ScheduleData, `${here}[${i}]`, errors));
    } else if (required && field.type !== "boolean" && blank(value)) {
      errors[here] = `${field.label} is required.`;
    }
  }
}

// Required-field pre-check, so an empty form is refused without a round trip. The server still validates
// everything (formats, ranges, cross-field rules) and its messages are shown the same way.
export function precheckSchedule(spec: ScheduleSpec, data: ScheduleData): ScheduleErrors {
  const errors: ScheduleErrors = {};
  checkFields(spec.sections.flatMap((s) => s.fields), data, "", errors);
  return errors;
}

export function errorsFromServer(list: { path: string; message: string }[] | undefined): ScheduleErrors {
  const out: ScheduleErrors = {};
  for (const e of list ?? []) if (!(e.path in out)) out[e.path] = e.message;
  return out;
}

// Mirrors the backend's scheduleTotal: the sum insured a schedule contributes to a risk-information row.
export function scheduleTotal(spec: ScheduleSpec, data: ScheduleData): number {
  const t = spec.total;
  if (!t) return 0;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  if (t.field) return n(data[t.field]);
  if (t.sum) {
    const add = (row: ScheduleData | undefined) => (t.sum ?? []).reduce((sum, k) => sum + n(row?.[k]), 0);
    return t.list ? ((data[t.list] as ScheduleData[] | undefined) ?? []).reduce((sum, row) => sum + add(row), 0) : add(data);
  }
  const rows = Array.isArray(data[t.list ?? ""]) ? (data[t.list ?? ""] as ScheduleData[]) : [];
  return rows.reduce((sum, row) => sum + n(row?.[t.multiply?.[0] ?? ""]) * n(row?.[t.multiply?.[1] ?? ""]), 0);
}

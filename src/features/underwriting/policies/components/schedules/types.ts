// Shapes of the class-specific risk schedule specs served by GET /api/transactions/meta/schedules.
// The backend (modules/policies/schedules) owns them and is the authority on validation; the form
// renders from them and only pre-checks what is cheap to check before a round trip.
export type FieldType = "text" | "textarea" | "money" | "number" | "int" | "date" | "select" | "multiselect" | "boolean" | "list";

export interface Condition {
  field: string;
  equals?: unknown;
  in?: unknown[];
  truthy?: boolean;
  gt?: number;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  requiredWhen?: Condition;
  showWhen?: Condition;
  options?: string[];
  min?: number;
  max?: number;
  exclusiveMin?: number;
  minItems?: number;
  maxItems?: number;
  notFuture?: boolean;
  help?: string;
  fields?: FieldSpec[];
}

export interface SectionSpec {
  title: string;
  hint?: string;
  fields: FieldSpec[];
}

export interface ScheduleSpec {
  key: string;
  label: string;
  authority?: string;
  classNames: string[];
  // How a risk-information row's sum insured is taken from this schedule (see scheduleTotal).
  total?: { field?: string; list?: string; sum?: string[]; multiply?: [string, string] };
  sections: SectionSpec[];
}

export type ScheduleData = Record<string, unknown>;
// A schedule is tied to the class it was filled in for, so changing the class never reuses another class's answers.
export interface ScheduleValue {
  classKey: string;
  data: ScheduleData;
}
// Error messages by field path ("origin_state", "containers[0].container_no").
export type ScheduleErrors = Record<string, string>;

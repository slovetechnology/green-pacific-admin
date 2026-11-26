import type { ComponentType } from "react";
import type { ScheduleData, ScheduleErrors, ScheduleSpec } from "../types";

export interface ScheduleFormProps {
  spec: ScheduleSpec;
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
  errors: ScheduleErrors;
  disabled?: boolean;
}

// Per-class layout overrides, keyed by the schedule key (e.g. "git", "boiler"). Empty on purpose: every
// class renders through the generic ScheduleForm until it needs a bespoke layout. To give a class its own
// sub-form, add a component beside this file taking ScheduleFormProps and register it here:
//   import { BoilerSchedule } from "./BoilerSchedule";
//   export const SCHEDULE_OVERRIDES = { boiler: BoilerSchedule };
// The field set and validation stay in the backend spec, so an override only changes presentation.
export const SCHEDULE_OVERRIDES: Record<string, ComponentType<ScheduleFormProps>> = {};

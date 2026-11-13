import { useState } from "react";
import { Modal } from "@/shared/components/exec/Modal";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { precheckSchedule, scheduleTotal } from "./resolveSchedule";
import { useScheduleSpecs } from "./useScheduleSpecs";
import type { ScheduleData, ScheduleErrors, ScheduleSpec, ScheduleValue } from "./types";
import { fmtMoney } from "@/shared/lib/format";

interface Props {
  open: boolean;
  specKey: string;
  initial: ScheduleValue | null;
  onSave: (value: ScheduleValue, total: number) => void;
  onClose: () => void;
}

function Body({ spec, initial, onSave, onClose }: { spec: ScheduleSpec; initial: ScheduleValue | null; onSave: Props["onSave"]; onClose: () => void }) {
  const [data, setData] = useState<ScheduleData>(initial?.classKey === spec.key ? initial.data : {});
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const total = scheduleTotal(spec, data);

  function save() {
    const missing = precheckSchedule(spec, data);
    setErrors(missing);
    if (Object.keys(missing).length) return;
    onSave({ classKey: spec.key, data }, total);
  }

  return (
    <>
      <ScheduleToolbar spec={spec} data={data} onChange={(next) => { setData(next); setErrors({}); }} />
      <p className="field-hint">Fields marked <span className="sch-req">*</span> are mandatory.</p>
      {Object.keys(errors).length > 0 && <div className="alert alert-danger" role="alert">{Object.keys(errors).length} field(s) need attention.</div>}
      <ScheduleForm spec={spec} data={data} errors={errors} onChange={(next) => { setData(next); setErrors({}); }} />
      <div className="sch-modal-foot">
        <strong>Sum insured from this schedule: {fmtMoney(total)}</strong>
        <span className="sch-toolbar-buttons">
          <button type="button" className="btn-secondary btn btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm" onClick={save}>Save schedule</button>
        </span>
      </div>
    </>
  );
}

// The class's own risk schedule in a dialog, opened from a risk-information row whose category is
// Fidelity Guarantee, Public Liability or Boilers. Saving closes it and hands back the schedule and the
// total that becomes the row's sum insured.
export function ItemScheduleModal({ open, specKey, initial, onSave, onClose }: Props) {
  const spec = useScheduleSpecs().data?.find((s) => s.key === specKey);
  return (
    <Modal open={open && Boolean(spec)} title={`Risk schedule — ${spec?.label ?? ""}`} onClose={onClose} wide>
      {spec && <Body spec={spec} initial={initial} onSave={onSave} onClose={onClose} />}
    </Modal>
  );
}

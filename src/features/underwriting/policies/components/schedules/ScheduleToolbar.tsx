import { useRef, useState } from "react";
import { api, apiUrl, ApiError } from "@/shared/api/client";
import type { FieldSpec, ScheduleData, ScheduleSpec } from "./types";

interface Props {
  spec: ScheduleSpec;
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
  disabled?: boolean;
}

const isBlankRow = (row: ScheduleData) => Object.values(row).every((v) => v === "" || v === undefined || v === null || v === false || (Array.isArray(v) && !v.length));

// Add / import / template / clear for the schedule, shown above its fields. They work on the class's
// repeating group (the first list in the spec); a class with no list only gets "Clear all", which
// empties the whole schedule.
export function ScheduleToolbar({ spec, data, onChange, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list: FieldSpec | undefined = spec.sections.flatMap((s) => s.fields).find((f) => f.type === "list");
  const rows = list ? ((data[list.key] as ScheduleData[] | undefined) ?? []) : [];
  const hasData = list ? rows.length > 0 : Object.keys(data).length > 0;

  async function handleFile(file: File | undefined) {
    if (!file || !list) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.upload<{ rows: ScheduleData[] }>(`/api/transactions/meta/schedules/${spec.key}/parse?field=${list.key}`, form);
      // The starter blank row is replaced; anything already filled in is kept.
      onChange({ ...data, [list.key]: [...rows.filter((r) => !isBlankRow(r)), ...result.rows] });
      setMsg({ ok: true, text: `${result.rows.length} row${result.rows.length === 1 ? "" : "s"} loaded from ${file.name}.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not read that file." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="sch-toolbar">
      <div className="sch-toolbar-buttons">
        {list && (
          <>
            <button type="button" className="btn btn-sm" disabled={disabled || Boolean(list.maxItems && rows.length >= list.maxItems)}
              onClick={() => onChange({ ...data, [list.key]: [...rows, {}] })}>
              + Add row
            </button>
            <button type="button" className="btn-secondary btn btn-sm" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Importing…" : "Import from Excel"}
            </button>
            <a className="btn-secondary btn-sm" href={apiUrl(`/api/transactions/meta/schedules/${spec.key}/template?field=${list.key}`)}>
              Download template
            </a>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
          </>
        )}
        {hasData && (
          <button type="button" className="btn-secondary btn btn-sm" disabled={disabled}
            onClick={() => { onChange(list ? { ...data, [list.key]: [] } : {}); setMsg(null); }}>
            Clear all
          </button>
        )}
      </div>
      {list && <p className="field-hint">Add, import or clear the rows of “{list.label}”.</p>}
      {msg && <div className={`flash ${msg.ok ? "flash-success" : "flash-warning"}`}>{msg.text}</div>}
    </div>
  );
}

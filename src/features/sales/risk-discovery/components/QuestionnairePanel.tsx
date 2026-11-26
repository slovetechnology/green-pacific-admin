import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "@/shared/styles/schedules.css";
import { api, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { FieldControl } from "@/features/underwriting/policies/components/schedules/fields/FieldControl";
import type { ScheduleErrors } from "@/features/underwriting/policies/components/schedules/types";
import type { DealQuestionnaire, QuestionnaireAnswers } from "../api";

// The deal's risk questionnaire for its class (backend risk-discovery/questionnaires.js). Saved as a draft any time;
// "Mark complete" checks every required answer. The deal can't be sent to market until it is complete, and the
// answers go on the broking slip (and, for a class with a NIIRA schedule, into the policy's risk schedule).

const toErrors = (list: { path: string; message: string }[]): ScheduleErrors => {
  const out: ScheduleErrors = {};
  for (const e of list) if (!(e.path in out)) out[e.path] = e.message;
  return out;
};

export function QuestionnairePanel({ dealId, canWrite, onChanged }: { dealId: number; canWrite: boolean; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const key = ["deals", String(dealId), "questionnaire"];
  const { data, isLoading, error: loadError } = useQuery({ queryKey: key, queryFn: () => api.get<DealQuestionnaire>(`/api/deals/${dealId}/questionnaire`) });
  const [answers, setAnswers] = useState<QuestionnaireAnswers | null>(null);
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<"save" | "complete" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // The server's copy replaces the form whenever it is (re)loaded and nothing unsaved would be lost.
  const serverVersion = data ? `${data.template.id}:${data.status}:${data.updatedAt ?? ""}` : "";
  const [loadedVersion, setLoadedVersion] = useState("");
  if (data && serverVersion !== loadedVersion && !dirty) {
    setLoadedVersion(serverVersion);
    setAnswers(data.answers);
    setErrors(toErrors(data.errors));
  }

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (isLoading) return <Panel eyebrow="Risk discovery" title="Risk questionnaire"><p className="exec-state">Loading the questionnaire…</p></Panel>;
  if (loadError || !data || !answers) return <Panel eyebrow="Risk discovery" title="Risk questionnaire"><p className="exec-state">The questionnaire could not be loaded.</p></Panel>;

  const disabled = !canWrite || !data.editable || busy !== null;
  const setField = (section: string) => (field: string, value: unknown) => {
    setAnswers((prev) => ({ ...(prev ?? {}), [section]: { ...((prev ?? {})[section] ?? {}), [field]: value } }));
    setDirty(true);
    setMessage(null);
  };

  async function send(kind: "save" | "complete") {
    setBusy(kind);
    setMessage(null);
    try {
      const next = kind === "save"
        ? await api.put<DealQuestionnaire>(`/api/deals/${dealId}/questionnaire`, { answers })
        : await api.post<DealQuestionnaire>(`/api/deals/${dealId}/questionnaire/complete`, { answers });
      queryClient.setQueryData(key, next);
      setDirty(false);
      setAnswers(next.answers);
      setErrors(toErrors(next.errors));
      setShowErrors(kind === "complete");
      setMessage({ tone: "ok", text: kind === "save" ? (next.errors.length ? `Draft saved. ${next.errors.length} answer${next.errors.length === 1 ? "" : "s"} still to give.` : "Draft saved. Everything is answered: mark it complete.") : "Questionnaire complete. It will go on the broking slip." });
      onChanged?.();
    } catch (err) {
      const list = err instanceof ApiError && Array.isArray(err.data?.errors) ? (err.data.errors as { path: string; message: string }[]) : [];
      if (list.length) { setErrors(toErrors(list)); setShowErrors(true); }
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The questionnaire could not be saved." });
    } finally {
      setBusy(null);
    }
  }

  const shown = showErrors ? errors : {};
  const sectionErrors = (sectionKey: string, fieldKeys: string[]) =>
    Object.keys(errors).filter((p) => fieldKeys.some((k) => p === `${sectionKey}.${k}` || p.startsWith(`${sectionKey}.${k}[`) || p.startsWith(`${sectionKey}.${k}.`))).length;
  const outstanding = Object.keys(errors).length;

  return (
    <Panel
      eyebrow="Risk discovery"
      title={data.template.title}
      actions={<StatusBadge status={data.status === "Not Started" ? "Not started" : data.status} />}
    >
      <p className="pl-hint">
        The answers go on the broking slip{data.template.scheduleKey ? " and become the policy's risk schedule when the deal is won" : ""}.
        The deal can't be sent to market until this is complete.
        {data.completedBy && data.status === "Complete" ? ` Completed by ${data.completedBy} on ${String(data.completedAt ?? "").slice(0, 10)}.` : ""}
        {" "}Version {data.template.version}.
      </p>
      {data.stale && (
        <div className="pl-notice" role="status">The class of business changed, so the earlier {data.stale.templateCode.replace(/_/g, " ")} answers no longer apply. Answer this questionnaire instead.</div>
      )}
      {data.newerVersion && <p className="pl-hint">A newer version of this questionnaire exists; these answers stay on the version they were given against.</p>}
      {!data.editable && <p className="pl-hint">The deal is closed, so the answers can't change.</p>}

      <div className="sch-sections">
        {data.template.sections.map((section, i) => {
          const count = showErrors ? sectionErrors(section.key, section.fields.map((f) => f.key)) : 0;
          return (
            <fieldset key={`${section.key}-${i}`} className="sch-section">
              <legend>{section.title}{count ? ` (${count} to fix)` : ""}</legend>
              {section.hint && <p className="field-hint">{section.hint}</p>}
              <div className="form-grid">
                {section.fields.map((field) => (
                  <FieldControl key={field.key} field={field} scope={(answers[section.key] ?? {}) as Record<string, unknown>} onChange={setField(section.key)}
                    errors={shown} path={section.key} disabled={disabled} idPrefix={`rq-${dealId}`} />
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
      {canWrite && data.editable && (
        <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => send("save")} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button type="button" className="btn btn-sm" onClick={() => send("complete")} disabled={busy !== null}>{busy === "complete" ? "Checking…" : data.status === "Complete" && !dirty ? "Save and keep complete" : "Mark complete"}</button>
          {!showErrors && outstanding > 0 && (
            <button type="button" className="btn-link" onClick={() => setShowErrors(true)}>Show what's missing ({outstanding})</button>
          )}
          {dirty && <span className="pl-hint" role="status">Unsaved changes</span>}
        </div>
      )}
    </Panel>
  );
}

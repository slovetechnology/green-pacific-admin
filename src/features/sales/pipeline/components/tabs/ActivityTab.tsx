import { useMemo, useState, type FormEvent } from "react";
import { api, apiUrl } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { describeError } from "../../lib/types";
import type { TabProps } from "./shared";

interface Entry {
  key: string;
  when: string;
  title: string;
  notes: string | null;
  by: string | null;
  stage?: boolean;
  recording?: number;
}

const HINTS: Record<string, string> = {
  "Proposal Sent": "Counts as the proposal being sent, which lets the deal move to Negotiation.",
  Acceptance: "Counts as the client's acceptance, one of the things needed to win the deal.",
};

export function ActivityTab({ detail, canWrite, refresh }: TabProps) {
  const { deal } = detail;
  const [type, setType] = useState("Note");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [recording, setRecording] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notes and calls interleaved with the deal's stage moves, newest first.
  const entries = useMemo<Entry[]>(() => {
    const fromActivities = detail.activities
      .filter((a) => !/^Stage changed:/.test(a.subject ?? "")) // the stage moves are listed from the history
      .map((a): Entry => ({
        key: `a${a.id}`, when: a.occurred_at || a.created_at || "", title: [a.activity_type, a.subject].filter(Boolean).join(": "),
        notes: a.notes, by: a.created_by, recording: a.recording_file_path ? a.id : undefined,
      }));
    const fromHistory = detail.history.map((h): Entry => ({
      key: `h${h.id}`, when: h.entered_at, stage: true, by: h.actor,
      title: h.from_stage ? `Stage: ${h.from_stage} → ${h.to_stage}` : `Started at ${h.to_stage}`,
      notes: [h.reason, h.approximate ? "Date approximate: recorded when the history began." : ""].filter(Boolean).join(" "),
    }));
    return [...fromActivities, ...fromHistory].sort((a, b) => b.when.localeCompare(a.when));
  }, [detail.activities, detail.history]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("activity_type", type);
      fd.append("subject", subject);
      fd.append("notes", notes);
      fd.append("occurred_at", date);
      if (recording) fd.append("recording", recording);
      await api.upload(`/api/deals/${deal.id}/activities`, fd);
      setSubject("");
      setNotes("");
      setDate("");
      setRecording(null);
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="tabpanel" id="deal-panel-activity" aria-labelledby="deal-tab-activity" tabIndex={0} className="exec-tabpanel">
      {canWrite && (
        <Panel eyebrow="Log" title="Record an activity">
          <form onSubmit={submit}>
            <div className="pl-inline-form">
              <div className="field"><label htmlFor="ac-type">Type</label>
                <select id="ac-type" value={type} onChange={(e) => setType(e.target.value)}>{detail.activityTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="ac-date">Date</label><input id="ac-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="field is-wide"><label htmlFor="ac-subject">Subject</label><input id="ac-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="field is-wide"><label htmlFor="ac-notes">Notes</label><textarea id="ac-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              {detail.commsActivityTypes.includes(type) && (
                <div className="field is-wide"><label htmlFor="ac-rec">Attachment (call recording, PDF or audio, optional)</label><input id="ac-rec" type="file" accept=".mp3,.wav,.m4a,.ogg,.pdf" onChange={(e) => setRecording(e.target.files?.[0] ?? null)} /></div>
              )}
            </div>
            {HINTS[type] && <p className="pl-hint">{HINTS[type]}</p>}
            {error && <div className="flash flash-error">{error}</div>}
            <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Add to the log"}</button>
          </form>
        </Panel>
      )}

      <Panel title={`Timeline (${entries.length})`}>
        {entries.length === 0 ? <p className="pl-hint" style={{ margin: 0 }}>Nothing recorded yet.</p> : (
          <ol className="pl-timeline">
            {entries.map((e) => (
              <li key={e.key} className={e.stage ? "is-stage" : undefined}>
                <time>{e.when.slice(0, 10)}</time>
                <div>
                  <div className="pl-tl-title">{e.title}{e.by ? <span className="pl-hint"> · {e.by}</span> : null}</div>
                  {e.notes && <p className="pl-tl-notes">{e.notes}</p>}
                  {e.recording && <a href={apiUrl(`/api/deals/activities/${e.recording}/recording`)}>Open the attachment</a>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { promptDialog } from "@/shared/components/Dialogs";
import { bindingKey, bindingUrl, type BindingQuote, type Subjectivity } from "../../lib/binding";

// Conditions attached to the cover (backend sales/binding/subjectivities.js). Open ones due at binding hold the
// approval of the instruction to bind; only an admin can waive one.

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
const DUE_LABEL: Record<string, string> = { Bind: "Before binding", Issue: "Before the policy is issued", Date: "By a date" };

export function SubjectivitiesPanel({ dealId, canWrite, isAdmin, quotes }: { dealId: number; canWrite: boolean; isAdmin: boolean; quotes: BindingQuote[] }) {
  const queryClient = useQueryClient();
  const key = bindingKey(dealId, "subjectivities");
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ subjectivities: Subjectivity[]; openAtBind: number }>(bindingUrl(dealId, "subjectivities")) });
  const [form, setForm] = useState({ description: "", due_stage: "Bind", due_on: "" });
  const [fromQuote, setFromQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ["deals", String(dealId)] });
      setMessage({ tone: "ok", text: ok });
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: errorText(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.post(bindingUrl(dealId, "subjectivities"), form), "Subjectivity added.")) setForm({ description: "", due_stage: "Bind", due_on: "" });
  }

  async function close(s: Subjectivity, status: "Satisfied" | "Waived") {
    const note = await promptDialog({
      title: status === "Satisfied" ? "Mark it met" : "Waive it",
      message: s.description,
      label: status === "Satisfied" ? "How it was met (survey report received, etc.)" : "Why it is waived",
      required: true, multiline: true, confirmLabel: status === "Satisfied" ? "Mark met" : "Waive",
    });
    if (note === null) return;
    await run(() => api.patch(bindingUrl(dealId, `subjectivities/${s.id}`), { status, note }), status === "Satisfied" ? "Marked as met." : "Waived.");
  }

  const rows = data?.subjectivities ?? [];
  const withSubj = quotes.filter((q) => q.status !== "Declined");
  return (
    <Panel eyebrow="Step 2" title="Subjectivities" actions={data && data.openAtBind > 0 ? <span className="pl-chip is-warn">{data.openAtBind} to meet before binding</span> : undefined}>
      <p className="pl-hint">Conditions the insurers attach. Those due before binding must be met (or waived by an admin) before the instruction to bind can be approved.</p>
      {message && <div className={`flash ${message.tone === "ok" ? "flash-success" : "flash-error"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
      {rows.length === 0 ? <p className="pl-hint" style={{ margin: 0 }}>None recorded.</p> : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead><tr><th>Condition</th><th>Due</th><th>Status</th>{canWrite && <th><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="wrap">{s.description}</td>
                  <td>{DUE_LABEL[s.due_stage]}{s.due_on ? ` (${s.due_on})` : ""}{s.overdue && <> <span className="pl-chip is-crit">Overdue</span></>}</td>
                  <td><StatusBadge status={s.status} />{s.resolution_note && <div className="pl-hint">{s.resolution_note}{s.closed_by ? ` (${s.closed_by})` : ""}</div>}</td>
                  {canWrite && (
                    <td>
                      <div className="pl-actions">
                        {s.status === "Open" && <button type="button" className="btn-link" onClick={() => close(s, "Satisfied")} disabled={busy}>Met</button>}
                        {s.status === "Open" && isAdmin && <button type="button" className="btn-link" onClick={() => close(s, "Waived")} disabled={busy}>Waive</button>}
                        {s.status === "Open" && <button type="button" className="btn-link" onClick={() => run(() => api.delete(bindingUrl(dealId, `subjectivities/${s.id}`)), "Removed.")} disabled={busy}>Remove</button>}
                        {s.status !== "Open" && <button type="button" className="btn-link" onClick={() => run(() => api.patch(bindingUrl(dealId, `subjectivities/${s.id}`), { status: "Open" }), "Reopened.")} disabled={busy}>Reopen</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <>
          <form onSubmit={add} className="pl-inline-form" style={{ marginTop: "0.8rem" }} aria-label="Add a subjectivity">
            <div className="field is-wide"><label htmlFor="sj-desc">Add a condition</label><input id="sj-desc" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="For example: satisfactory risk survey within 30 days" /></div>
            <div className="field">
              <label htmlFor="sj-due">Due</label>
              <select id="sj-due" value={form.due_stage} onChange={(e) => setForm({ ...form, due_stage: e.target.value })}>{Object.entries(DUE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            {form.due_stage === "Date" && <div className="field"><label htmlFor="sj-on">Due on</label><input id="sj-on" type="date" required value={form.due_on} onChange={(e) => setForm({ ...form, due_on: e.target.value })} /></div>}
            <div className="field"><button type="submit" className="btn btn-sm" disabled={busy}>Add</button></div>
          </form>
          {withSubj.length > 0 && (
            <div className="pl-inline-form">
              <div className="field">
                <label htmlFor="sj-quote">Or import a quote's subjectivities</label>
                <select id="sj-quote" value={fromQuote} onChange={(e) => setFromQuote(e.target.value)}>
                  <option value="">Choose a quote…</option>
                  {withSubj.map((q) => <option key={q.id} value={q.id}>{q.insurer_name}{q.quote_reference ? ` (${q.quote_reference})` : ""}</option>)}
                </select>
              </div>
              <div className="field"><button type="button" className="btn-secondary btn btn-sm" disabled={!fromQuote || busy} onClick={async () => { if (await run(() => api.post(bindingUrl(dealId, "subjectivities"), { quote_id: Number(fromQuote) }), "Imported.")) setFromQuote(""); }}>Import</button></div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

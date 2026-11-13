import type { Preview } from "../api/engine";

/** The policy as it would read: schedule, then each section of wording with its placeholders filled in. */
export function PolicyPreview({ preview, isLoading, productName }: { preview: Preview | undefined; isLoading: boolean; productName?: string }) {
  if (isLoading || !preview) return <div className="card"><p className="pb-muted">Building the preview…</p></div>;
  const specimen = preview.document.sections.some((s) => s.entries.some((e) => e.source === "broker_master"));
  return (
    <div className="card pb-preview">
      <p className="pb-specimen">
        {specimen ? "SPECIMEN: contains broker master wording that is not insurer-approved. " : ""}This is a preview. Nothing has been issued.
      </p>
      <h3 style={{ marginTop: 0 }}>{productName ?? "Policy"}: Schedule</h3>
      <table className="pb-schedule">
        <tbody>
          {preview.schedule.map((s) => (
            <tr key={s.key}><th scope="row">{s.label}</th><td>{s.value ?? <span className="pb-needed-text">not provided</span>}</td></tr>
          ))}
        </tbody>
      </table>
      {preview.riskSchedule && (
        <section>
          <h4>{preview.riskSchedule.title} ({preview.riskSchedule.count})</h4>
          <div className="pb-table-wrap">
            <table>
              <thead><tr>{preview.riskSchedule.columns.map((c) => <th key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>{c.label}</th>)}</tr></thead>
              <tbody>
                {preview.riskSchedule.rows.map((r, i) => <tr key={i}>{preview.riskSchedule!.columns.map((c) => <td key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>{r[c.key] ?? ""}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="pb-muted" style={{ margin: "0.3rem 0 0" }}>Total of the schedule: NGN {preview.riskSchedule.total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
        </section>
      )}
      {preview.document.limitSections.map((s) => (
        <section key={s.key}>
          <h4>{s.title}</h4>
          <table className="pb-schedule">
            <tbody>{s.entries.map((e) => <tr key={e.code}><th scope="row">{e.name}</th><td>{e.text}</td></tr>)}</tbody>
          </table>
        </section>
      ))}
      {preview.document.sections.map((s) => (
        <section key={s.key}>
          <h4>{s.title}</h4>
          {s.entries.map((e, i) => (
            <div key={e.code} className="pb-clause">
              <div className="pb-clause-name">{i + 1}. {e.name} <span className="pb-muted">v{e.version}{e.source === "broker_master" ? "" : ` · ${e.source?.replace("_", " ")}`}</span></div>
              <p>{e.text}</p>
              {e.missing && e.missing.length > 0 && <div className="pb-issue">Not provided: {e.missing.map((m) => `{{${m}}}`).join(", ")}</div>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

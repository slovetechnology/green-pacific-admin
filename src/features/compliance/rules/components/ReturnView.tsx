import { fmtMoney } from "@/shared/lib/format";
import type { ColumnType, Finding, ReturnOutput, ReturnSection } from "../lib/types";

function show(value: unknown, type?: ColumnType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return fmtMoney(value);
  if (type === "number") return Number(value).toLocaleString("en-NG");
  if (type === "pct") return `${Number(value).toFixed(2)}%`;
  return String(value);
}

const numeric = (type: ColumnType) => type === "money" || type === "number" || type === "pct";

export function Findings({ items }: { items: Finding[] }) {
  if (!items.length) return <div className="finding finding-info">No findings: every check passed.</div>;
  const order = { error: 0, warning: 1, info: 2 };
  return <div>
    {[...items].sort((a, b) => order[a.level] - order[b.level]).map((f, i) => (
      <div key={i} className={`finding finding-${f.level}`}><strong>{f.level === "error" ? "Error" : f.level === "warning" ? "Warning" : "Note"}:</strong> {f.message}</div>
    ))}
  </div>;
}

function Section({ section }: { section: ReturnSection }) {
  if (section.type === "kv") {
    return <section style={{ marginTop: "1rem" }}>
      <div className="section-title">{section.title}</div>
      {section.note && <div className="field-hint">{section.note}</div>}
      <div className="table-wrap"><table><tbody>
        {section.items.map((it) => <tr key={it.label}><td>{it.label}</td><td className={it.type && numeric(it.type) ? "num" : undefined}><strong>{show(it.value, it.type)}</strong></td></tr>)}
      </tbody></table></div>
    </section>;
  }
  return <section style={{ marginTop: "1rem" }}>
    <div className="section-title">{section.title}</div>
    {section.note && <div className="field-hint">{section.note}</div>}
    <div className="table-wrap"><table>
      <thead><tr>{section.columns.map((c) => <th key={c.key} className={numeric(c.type) ? "num" : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>
        {section.rows.length === 0 && <tr><td colSpan={section.columns.length} className="empty-state">No records for this period.</td></tr>}
        {section.rows.map((row, i) => <tr key={i}>{section.columns.map((c) => <td key={c.key} data-label={c.label} className={numeric(c.type) ? "num" : undefined}>{show(row[c.key], c.type)}</td>)}</tr>)}
        {section.totals && <tr style={{ fontWeight: 600 }}>{section.columns.map((c) => <td key={c.key} data-label={c.label} className={numeric(c.type) ? "num" : undefined}>{show(section.totals?.[c.key], c.type)}</td>)}</tr>}
      </tbody>
    </table></div>
  </section>;
}

/** One computed NAICOM return: its findings first (what needs fixing before filing), then its schedules. */
export function ReturnView({ output, showHeading = false }: { output: ReturnOutput; showHeading?: boolean }) {
  return <div>
    {showHeading && <h2 style={{ marginTop: "1.5rem" }}>{output.code} · {output.name}</h2>}
    <div className="field-hint">{output.period.label} ({output.period.start} to {output.period.end}) · worked out {output.generatedAt.slice(0, 16).replace("T", " ")} UTC</div>
    <div style={{ marginTop: "0.75rem" }}><Findings items={output.validations} /></div>
    {output.sections.map((s) => <Section key={s.key} section={s} />)}
  </div>;
}

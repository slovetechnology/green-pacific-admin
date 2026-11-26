import type { ReportPayload } from "../../lib/types";

type Row = Record<string, string | number>;
interface Block { lines?: Row[]; note?: string; localContentCheck?: string; totalPlacements?: number; totalPremiumByCurrency?: string; naira_equivalent_note?: string }
interface Notes { basis?: string; exceptions?: string; unconverted?: string }

function Table({ title, rows }: { title: string; rows: Row[] | undefined }) {
  const columns = rows && rows.length ? Object.keys(rows[0]) : [];
  const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  return (
    <section>
      <div className="section-title">{title}</div>
      <div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead>
        <tbody>{rows && rows.length ? rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c}>{String(r[c] ?? "") || "-"}</td>)}</tr>)
          : <tr><td className="empty-state">Nothing recorded for this year.</td></tr>}</tbody></table></div>
    </section>
  );
}

// The part of the annual reinsurance return that is drawn from the reinsurance module. Read only here: the
// figures are refreshed from the module, and anything to explain goes in the remarks.
export function ReinsuranceReturnSection({ payload }: { payload: ReportPayload }) {
  const placements = (payload.reinsurancePlacements || {}) as Block;
  const rules = (payload.regulatoryRulesApplied || {}) as Block;
  const notes = (payload.returnNotes || {}) as Notes;
  const get = (k: string) => ((payload[k] || {}) as Block).lines;
  return (
    <div>
      <div className="flash flash-info">Drawn from the reinsurance module: {placements.totalPlacements ?? 0} placement(s) signed in the year. {placements.totalPremiumByCurrency}. {notes.basis}</div>
      {placements.naira_equivalent_note && <div className="flash flash-warning">{placements.naira_equivalent_note} {notes.unconverted}</div>}
      {notes.exceptions && <div className="flash flash-warning">Needs explaining in the remarks: {notes.exceptions}.</div>}
      <Table title="Placements by reinsurer" rows={placements.lines} />
      <Table title="Premium by reinsurer" rows={get("reinsurerSummary")} />
      <Table title="Offshore placements and NAICOM approvals" rows={get("offshoreApprovalsRegister")} />
      <Table title="Treaties in force" rows={get("treatiesInForce")} />
      <Table title="Claim recoveries billed" rows={get("claimRecoveries")} />
      <Table title="Regulatory rules applied" rows={rules.lines} />
      <p className="field-hint">{rules.localContentCheck} {rules.note}.</p>
    </div>
  );
}

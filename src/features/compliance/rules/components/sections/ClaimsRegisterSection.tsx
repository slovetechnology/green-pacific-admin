import { fmtMoney, fmtPct } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import type { ClaimsRegister } from "../../lib/types";

// Read-only for the same reason as the premium register: these lines are a
// snapshot of `claims`, so a wrong figure belongs to the claim record.
export function ClaimsRegisterSection({
  register,
  remarks,
  onRemarksChange,
  editable,
}: {
  register: ClaimsRegister;
  remarks: string;
  onRemarksChange: (value: string) => void;
  editable: boolean;
}) {
  const lines = register.lines || [];
  const isNilReturn = lines.length === 0;

  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="card kpi-card">
          <div className="kpi-label">Notified this month</div>
          <div className="kpi-value">{register.claimsNotifiedInMonth ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Settled this month</div>
          <div className="kpi-value">{register.claimsSettledInMonth ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Outstanding</div>
          <div className="kpi-value">{fmtMoney(register.totalOutstandingAmount)}</div>
          <div className="field-hint">{register.claimsOutstanding ?? 0} open claims</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Settlement rate</div>
          <div className="kpi-value">{fmtPct(register.settlementRate, 1)}</div>
        </div>
      </div>

      <div className="section-title">Claims register — {lines.length} claim{lines.length === 1 ? "" : "s"}</div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Claim No.</th>
              <th>Client</th>
              <th>Insurer</th>
              <th>Policy</th>
              <th>Loss Type</th>
              <th>Date of Loss</th>
              <th>Reported</th>
              <th>Settled</th>
              <th>Status</th>
              <th className="num">Claimed</th>
              <th className="num">Incurred</th>
              <th className="num">Settled</th>
              <th className="num">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {isNilReturn && (
              <tr>
                <td colSpan={13} className="empty-state">
                  No claims notified, settled, or outstanding in this period.
                </td>
              </tr>
            )}
            {lines.map((line, index) => (
              <tr key={`${line.claimNumber}-${index}`}>
                <td>
                  {line.claimNumber || "—"}
                  {!line.notifiedInMonth && <div className="field-hint">carried forward</div>}
                </td>
                <td>{line.clientName || "—"}</td>
                <td>{line.insurerName || "—"}</td>
                <td>{line.policyNumber || "—"}</td>
                <td>{line.lossType || "—"}</td>
                <td>{line.dateOfLoss || "—"}</td>
                <td>{line.dateReported || "—"}</td>
                <td>{line.dateSettled || "—"}</td>
                <td><StatusBadge status={line.status} /></td>
                <td className="num">{fmtMoney(line.claimedAmount)}</td>
                <td className="num">{fmtMoney(line.incurredAmount)}</td>
                <td className="num">{fmtMoney(line.amountSettled)}</td>
                <td className="num">{fmtMoney(line.outstandingAmount)}</td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan={9}>Totals</th>
                <th className="num">{fmtMoney(register.totalClaimedAmount)}</th>
                <th className="num">{fmtMoney(register.totalIncurredAmount)}</th>
                <th className="num">{fmtMoney(register.totalSettledAmount)}</th>
                <th className="num">{fmtMoney(register.totalOutstandingAmount)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="field-hint" style={{ marginTop: "0.6rem" }}>
        Incurred cost is the greater of the amount claimed and approved + reserve, the same basis the
        Loss Experience report uses. Claims still open carry forward onto every subsequent register
        until they settle.
      </p>

      <div className="section-title">Remarks</div>
      <div className="field">
        <label htmlFor="claimsRemarks">
          {isNilReturn ? "Nil return declaration (required)" : "Remarks"}
        </label>
        <textarea
          id="claimsRemarks"
          rows={3}
          value={remarks}
          disabled={!editable}
          placeholder={isNilReturn ? "e.g. No claims notified or outstanding in the period." : ""}
          onChange={(e) => onRemarksChange(e.target.value)}
        />
        {isNilReturn && (
          <div className="field-hint">
            A month with no claims still has to be filed, and has to say so — a blank register cannot
            be submitted without this note.
          </div>
        )}
      </div>
    </>
  );
}

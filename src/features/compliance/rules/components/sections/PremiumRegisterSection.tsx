import { fmtMoney, fmtPct } from "@/shared/lib/format";
import type { PremiumRegister } from "../../lib/types";

// The lines are read-only on purpose. They are a snapshot of
// `transactions` taken by derivePremiumRegister(), so a wrong figure here
// is a wrong figure in the ledger — fixing it on the filing alone would
// leave the two disagreeing. Correct the transaction, then Refresh.
export function PremiumRegisterSection({
  register,
  declarationText,
  onDeclarationChange,
  editable,
}: {
  register: PremiumRegister;
  declarationText: string;
  onDeclarationChange: (value: string) => void;
  editable: boolean;
}) {
  const lines = register.lines || [];

  return (
    <>
      <div className="section-title">Premium register — {lines.length} polic{lines.length === 1 ? "y" : "ies"}</div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Policy No.</th>
              <th>Client</th>
              <th>Insurer</th>
              <th>Class</th>
              <th className="num">Sum Insured</th>
              <th className="num">Gross Premium</th>
              <th className="num">Rate</th>
              <th className="num">Brokerage</th>
              <th className="num">ISS Levy (1%)</th>
              <th className="num">Net to Insurer</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={10} className="empty-state">No placements booked in this period.</td></tr>
            )}
            {lines.map((line, index) => (
              <tr key={`${line.policyNumber}-${index}`}>
                <td>{line.policyNumber || "—"}</td>
                <td>{line.clientName || "—"}</td>
                <td>{line.insurerName || "—"}</td>
                <td>{line.classOfBusiness || "—"}</td>
                <td className="num">{fmtMoney(line.sumInsured)}</td>
                <td className="num">{fmtMoney(line.grossPremium)}</td>
                <td className="num">
                  {fmtPct(line.brokerageRate, 2)}
                  {/* Surfaced by the backend when the rate stored on the
                      transaction disagrees with the amounts on its own
                      line. The filed rate is derived from the money. */}
                  {line.storedBrokerageRate !== undefined && (
                    <div className="field-hint" style={{ color: "var(--status-warning)" }}>
                      ledger says {fmtPct(line.storedBrokerageRate, 2)}
                    </div>
                  )}
                </td>
                <td className="num">{fmtMoney(line.brokerageAmount)}</td>
                <td className="num">{fmtMoney(line.issLevy)}</td>
                <td className="num">{fmtMoney(line.netPremiumToInsurer)}</td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan={4}>Totals</th>
                <th className="num">{fmtMoney(register.totalSumInsured)}</th>
                <th className="num">{fmtMoney(register.totalGrossPremium)}</th>
                <th></th>
                <th className="num">{fmtMoney(register.totalBrokerage)}</th>
                <th className="num">{fmtMoney(register.totalISSLevy)}</th>
                <th className="num">{fmtMoney(register.totalNetPremium)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="field-hint" style={{ marginTop: "0.6rem" }}>
        ISS Levy is 1% of brokerage, remitted to NAICOM alongside this return. It is computed for the
        filing — it is not booked against individual policies.
      </p>

      <div className="section-title">Declaration</div>
      <div className="field">
        <label htmlFor="declarationText">Notes accompanying this return</label>
        <textarea
          id="declarationText"
          rows={3}
          value={declarationText}
          disabled={!editable}
          onChange={(e) => onDeclarationChange(e.target.value)}
        />
      </div>
    </>
  );
}

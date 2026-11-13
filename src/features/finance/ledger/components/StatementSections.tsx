import { Link } from "react-router";
import { fmtMinor } from "../api/ledger";

// Headed groups of account lines with a subtotal each: the body of the Profit or Loss and the Balance Sheet.
export interface StatementLine {
  accountId: number | null;
  code: string;
  name: string;
  amount: number;
  computed?: boolean;
  classification?: string;
}
export interface StatementSection {
  code: string;
  name: string;
  accounts: StatementLine[];
  total: number;
}

interface Props {
  title: string;
  sections: StatementSection[];
  total: number;
  totalLabel: string;
  currency: string;
  ledgerRange: { from: string; to: string };
  showClassification?: boolean;
}

export function StatementSections({ title, sections, total, totalLabel, currency, ledgerRange, showClassification = false }: Props) {
  const qs = `?from=${ledgerRange.from}&to=${ledgerRange.to}`;
  return (
    <div className="card">
      <h2>{title}</h2>
      {sections.length === 0 ? (
        <p className="ledger-note">Nothing posted.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-grid-table ledger-statement">
            <tbody>
              {sections.map((s) => (
                <SectionRows key={s.code || s.name} section={s} currency={currency} qs={qs} showClassification={showClassification} />
              ))}
            </tbody>
            <tfoot>
              <tr className="ledger-grand-total">
                <th colSpan={2}>{totalLabel}</th>
                <th className="num">{fmtMinor(total, currency)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SectionRows({ section, currency, qs, showClassification }: { section: StatementSection; currency: string; qs: string; showClassification: boolean }) {
  return (
    <>
      <tr className="ledger-section-head">
        <th colSpan={3}>{section.name}</th>
      </tr>
      {section.accounts.map((a) => (
        <tr key={a.accountId ?? a.name}>
          <td className="ledger-code">{a.code}</td>
          <td>
            {a.accountId ? <Link to={`/ledger/accounts/${a.accountId}${qs}`}>{a.name}</Link> : <em>{a.name}</em>}
            {showClassification && a.classification === "Fiduciary" && <span className="badge badge-warning ledger-tag">Client money</span>}
          </td>
          <td className="num">{fmtMinor(a.amount, currency)}</td>
        </tr>
      ))}
      <tr className="ledger-subtotal">
        <td className="ledger-code" />
        <td>Total {section.name.toLowerCase()}</td>
        <td className="num">{fmtMinor(section.total, currency)}</td>
      </tr>
    </>
  );
}

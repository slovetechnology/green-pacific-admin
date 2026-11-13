import { Link } from "react-router";
import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";

interface ImportResult extends ImportResultBase {
  transactions: { id: number; policyNo: string; client: string }[];
}

export function TransactionImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/transactions-import"
      title="Upload Transactions"
      noun="transactions"
      backTo="/transactions"
      backLabel="Go to Transactions"
      invalidate="transactions"
      intro={
        <>
          Fill in one row per transaction. Columns marked <strong>Yes</strong> below are required; leave the rest blank if
          they don't apply. Dates are best as <strong>YYYY-MM-DD</strong>; DD/MM/YYYY is also read. A client or insurer name
          not on the system is added as new. A row matching a transaction already booked (same client, insurer, class, date,
          premium and policy number) is skipped, so uploading a sheet twice books nothing twice.
          <br /><br />
          For a fleet of vehicles, a schedule of property or a list of insured persons (group / individual life), add one
          row per item on the <strong>Schedule</strong> sheet and give each the <strong>Policy No</strong> of its transaction
          row. The policy's sum insured becomes the total of its schedule. A Policy No used on the Schedule sheet must appear
          on only one transaction row.
        </>
      }
      details={(r) =>
        r.transactions.length > 0 && (
          <div className="card">
            <h2>Transactions imported</h2>
            <ul>
              {r.transactions.map((t) => (
                <li key={t.id}><Link to={`/transactions/${t.id}`}>{t.policyNo || `#${t.id}`}</Link> · {t.client}</li>
              ))}
            </ul>
          </div>
        )
      }
    />
  );
}

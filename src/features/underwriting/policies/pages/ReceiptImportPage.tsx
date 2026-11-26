import { Link } from "react-router";
import {
  SpreadsheetImport,
  type ImportResultBase,
} from "@/shared/components/SpreadsheetImport";
import { fmtMoney } from "@/shared/lib/format";

interface ImportResult extends ImportResultBase {
  receipts: {
    id: number;
    receiptNo: string;
    client: string;
    date: string;
    policies: string[];
    total: number;
  }[];
  totalAmount: number;
}

export function ReceiptImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/receipts-import"
      title="Upload Receipts"
      noun="receipts"
      backTo="/receipts"
      backLabel="Go to Receipts"
      invalidate="receipts"
      intro={
        <>
          Fill in one row per policy paid: <strong>Client Name</strong>,{" "}
          <strong>Policy No</strong>, <strong>Receipt Date</strong> and{" "}
          <strong>Amount</strong> are required. Rows with the same client, date
          and <strong>Payment Reference</strong> become one receipt covering
          several policies. Each receipt is checked exactly as on the New
          receipt form: the client and policy must already exist, a policy can't
          be receipted for more than is left on it, Direct Bill policies are
          refused, and the receipt date's month must be open. Policy balances
          update straight away. A payment already receipted (same policy, date,
          reference and amount) is skipped, so uploading a sheet twice receipts
          nothing twice.
        </>
      }
      summary={(r) => (
        <div>
          <div className="k">Total receipted</div>
          <div className="v">{fmtMoney(r.totalAmount)}</div>
        </div>
      )}
      details={(r) =>
        r.receipts.length > 0 && (
          <div className="card">
            <h2>Receipts issued</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Policies</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.receipts.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link to={`/receipts/${x.id}`}>{x.receiptNo}</Link>
                    </td>
                    <td>{x.client}</td>
                    <td>{x.date}</td>
                    <td>{x.policies.join(", ")}</td>
                    <td className="num">{fmtMoney(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    />
  );
}

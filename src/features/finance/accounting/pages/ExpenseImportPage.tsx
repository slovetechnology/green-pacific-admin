import { SpreadsheetImport, type ImportResultBase } from "@/shared/components/SpreadsheetImport";
import { fmtMoney } from "@/shared/lib/format";

interface ImportResult extends ImportResultBase {
  expenses: { id: number; date: string; category: string; amount: number }[];
  totalAmount: number;
}

export function ExpenseImportPage() {
  return (
    <SpreadsheetImport<ImportResult>
      endpoint="/api/expenses-import"
      title="Upload Expenses"
      noun="expenses"
      backTo="/expenses"
      backLabel="Go to Expenses"
      invalidate="expenses"
      intro={
        <>
          Fill in one row per expense: <strong>Date</strong>, <strong>Category</strong> and <strong>Amount</strong> are required.
          A row dated in a month that is closed in Accounting Periods is refused, exactly as on the expense form. A row that
          matches an expense already logged (same date, amount and description or reference) is skipped, so uploading a
          sheet twice logs nothing twice. Uploaded expenses count towards each month's actual expense in Financials straight away.
        </>
      }
      summary={(r) => (
        <div>
          <div className="k">Total imported</div>
          <div className="v">{fmtMoney(r.totalAmount)}</div>
        </div>
      )}
    />
  );
}

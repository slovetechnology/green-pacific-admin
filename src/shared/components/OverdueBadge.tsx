import type { PremiumInvoice } from "@/features/underwriting/policies/lib/premiumInvoices";

// Due-in / overdue badge for a premium invoice (debit note).
export function OverdueBadge({ invoice }: { invoice: Pick<PremiumInvoice, "daysOverdue" | "dueDate"> }) {
  if (invoice.daysOverdue === null) return <span className="badge">No due date</span>;
  if (invoice.daysOverdue <= 0) {
    return <span className="badge badge-part-paid">{invoice.daysOverdue === 0 ? "Due today" : `Due in ${-invoice.daysOverdue} days`}</span>;
  }
  return <span className="badge badge-unpaid">{invoice.daysOverdue} days overdue</span>;
}

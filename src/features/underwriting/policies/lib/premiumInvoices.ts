// Shared shapes for the Premium Invoices page and the policy detail panel
// (backend: lib/premiumInvoices.js).
export interface Reminder {
  stage: string;
  created_at: string;
  task_id: number | null;
}

export interface PremiumInvoice {
  invoiceKey: string;
  clientId: number;
  clientName: string;
  debitNoteNo: string | null;
  dueDate: string | null;
  amountDue: number;
  daysOverdue: number | null;
  isOverdue: boolean;
  policies: { transactionId: number; policyNo: string | null; classOfBusiness: string | null; insurerName: string; balanceOs: number }[];
  reminders: Reminder[];
}

export interface PremiumInvoicesResponse {
  invoices: PremiumInvoice[];
  totals: { count: number; amountDue: number; overdueCount: number; overdueAmount: number };
  stages: { stage: string; days: number; label: string }[];
}

export const REMINDER_LABELS: Record<string, string> = { overdue_15: "15-day reminder", overdue_30: "30-day reminder" };

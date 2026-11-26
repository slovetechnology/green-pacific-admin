import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { OverdueBadge } from "@/shared/components/OverdueBadge";
import { SubBrokerPanel } from "@/features/partners/sub-brokers/components/SubBrokerPanel";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { usePbAccess } from "@/features/underwriting/policy-bank/api/policyBank";
import { PolicyWordingPanel } from "@/features/underwriting/policy-bank/components/PolicyWordingPanel";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import "@/shared/styles/executive.css";
import { ScheduleView } from "../components/schedules/ScheduleView";
import { REMINDER_LABELS, type PremiumInvoice } from "../lib/premiumInvoices";
import { alertDialog, confirmDialog } from "@/shared/components/Dialogs";
import { usePolicyModification } from "@/features/underwriting/endorsement-engine/usePolicyModification";
import { CoverPanel } from "@/features/underwriting/cover/CoverPanel";
import "@/shared/styles/endorsement-engine.css";
import { PolicyLedgerTimeline } from "@/features/underwriting/endorsement-engine/components/PolicyLedgerTimeline";

const SPLIT_TYPES = ["WritingAgent", "Referral", "Agency", "Other"] as const;

interface CommissionSplit {
  splitType: (typeof SPLIT_TYPES)[number];
  payeeName: string | null;
  percentage: number;
  amount: number;
}

interface CommissionLedger {
  grossPremium: number;
  carrierNetPremium: number;
  agencyGrossCommission: number;
  splits: CommissionSplit[];
  allocated: number;
  unallocated: number;
}

interface PolicyEvent {
  id: number;
  event_type: string;
  event_date: string;
  effective_date: string | null;
  summary: string;
  details: string | null;
  endorsement_transaction_id: number | null;
  note_credit_note_no: string | null;
  note_premium_due: number | null;
  note_status: string | null;
}

interface EndorsementsResponse {
  events: PolicyEvent[];
}

interface Transaction {
  id: number;
  trans_date: string | null;
  credit_note_no: string | null;
  debit_note_no: string | null;
  slip_no: string | null;
  client_id: number;
  client_name: string;
  insurer_id: number;
  insurer_name: string;
  class_of_business: string | null;
  business_type: string | null;
  policy_no: string | null;
  sum_insured: number;
  annual_premium_due: number;
  start_date: string | null;
  end_date: string | null;
  premium_due: number;
  commission_rate: number;
  brokerage: number;
  co_brokers: number;
  total_brokerage: number;
  net_premium: number;
  premium_paid: number;
  balance_os: number;
  status: string | null;
  date_of_payment: string | null;
  commission_earned: number;
  deferred_commission: number;
  producer: string | null;
  transaction_narration: string | null;
  parent_transaction_id: number | null;
  tppd_limit: number | null;
  vehicle_make: string | null;
  registration_no: string | null;
  engine_no: string | null;
  chassis_no: string | null;
  property_type: string | null;
  property_description: string | null;
  risk_location: string | null;
  billing_mode: "Agency" | "Direct";
  payment_due_date: string | null;
}

interface RiskItem {
  id: number;
  kind: "vehicle" | "property" | "life";
  item_value: number;
  // DELETED_ENDORSED: removed by an item deletion endorsement; it stays on the schedule.
  status?: "ACTIVE" | "DELETED_ENDORSED";
  effective_removal_date?: string | null;
  vehicle_make?: string | null;
  registration_no?: string | null;
  engine_no?: string | null;
  chassis_no?: string | null;
  property_category?: string | null;
  property_description?: string | null;
  risk_location?: string | null;
  insured_name?: string | null;
  date_of_birth?: string | null;
  annual_earning?: number | null;
  nin?: string | null;
}

interface TransactionDetailResponse {
  transaction: Transaction;
  riskItems: RiskItem[];
  // The class-specific risk schedule (NIIRA 2025), if one is recorded.
  riskSchedule: { classKey: string; data: Record<string, unknown> } | null;
  // Set when this row is an endorsement adjustment note.
  parent: { id: number; policy_no: string | null; credit_note_no: string | null } | null;
  // Set on an original policy that has been endorsed.
  endorsementNotes: Transaction[];
  effectiveTerms: Transaction | null;
  // The open Agency Bill invoice (debit note) this policy is on, if unpaid.
  premiumInvoice: PremiumInvoice | null;
  // Commission the insurer has paid on this policy, from reconciled statements.
  complianceExceptions: {
    id: number;
    rule_code: string;
    rule_name: string;
    severity: "block" | "warn";
    message: string;
    status: "Open" | "Overridden";
    overridden_by: string | null;
    override_reason: string | null;
  }[];
  commissionReceived: {
    total: number;
    statements: { statementId: number; statementRef: string | null; depositDate: string | null; amount: number }[];
  };
  // The submission and quote this policy was placed on (lib/placement.js).
  originatingQuote: {
    submission_id: number;
    deal_id: number | null;
    submission_no: string;
    quote_id: number | null;
    quote_reference: string | null;
    premium: number | null;
    insurer_name: string | null;
  } | null;
}

function RiskItemsCard({ items }: { items: RiskItem[] }) {
  if (!items.length) return null;
  const kind = items[0].kind;
  const cols: [string, (i: RiskItem) => string][] =
    kind === "vehicle"
      ? [["Make of vehicle", (i) => i.vehicle_make || "—"], ["Registration number", (i) => i.registration_no || "—"], ["Engine number", (i) => i.engine_no || "—"], ["Chassis number", (i) => i.chassis_no || "—"], ["Value", (i) => fmtMoney(i.item_value)]]
      : kind === "life"
        ? [["Name of insured person", (i) => i.insured_name || "—"], ["Date of birth", (i) => i.date_of_birth || "—"], ["Annual earning", (i) => (i.annual_earning == null ? "—" : fmtMoney(i.annual_earning))], ["Sum assured", (i) => fmtMoney(i.item_value)], ["NIN", (i) => i.nin || "—"]]
        : [["Category of property", (i) => i.property_category || "—"], ["Description of property", (i) => i.property_description || "—"], ["Sum insured / limit of liability", (i) => fmtMoney(i.item_value)], ["Risk location", (i) => i.risk_location || "—"]];
  const total = items.filter((i) => i.status !== "DELETED_ENDORSED").reduce((sum, i) => sum + (i.item_value || 0), 0);
  const heading = kind === "vehicle" ? "motor" : kind === "life" ? "life" : "non-motor";
  return (
    <div className="card">
      <h2>Risk information — {heading} ({items.length})</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {cols.map(([label]) => <th key={label}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} style={item.status === "DELETED_ENDORSED" ? { opacity: 0.6, textDecoration: "line-through" } : undefined}>
                <td>
                  {idx + 1}
                  {item.status === "DELETED_ENDORSED" && <span className="ee-chip is-crit" style={{ textDecoration: "none", marginLeft: 4 }}>Deleted (endorsed) {item.effective_removal_date}</span>}
                </td>
                {cols.map(([label, get]) => <td key={label}>{get(item)}</td>)}
              </tr>
            ))}
          </tbody>
          {items.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={cols.length}><strong>Total</strong></td>
                <td><strong>{fmtMoney(total)}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function TransactionDetailPage() {
  const { user: me } = useAuth();
  const pbAccess = usePbAccess(!!me && !me.isAgent);
  const { txId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", txId],
    queryFn: () => api.get<TransactionDetailResponse>(`/api/transactions/${txId}`),
  });

  // Posted policies: Edit / Delete open the Modification Reason modal and route to an endorsement or reversal.
  const policyMod = usePolicyModification({
    txId: Number(txId),
    clientId: data?.transaction.client_id ?? 0,
    items: (data?.riskItems ?? []).map((i) => ({
      id: i.id,
      value: i.item_value,
      removed: i.status === "DELETED_ENDORSED",
      label: `${i.registration_no || i.vehicle_make || i.property_description || i.property_category || i.insured_name || `Item #${i.id}`} — ${fmtMoney(i.item_value)}`,
    })),
    onDirect: (action) => {
      if (action === "EDIT") navigate(`/transactions/${txId}/edit`);
      else if (action === "DELETE") void handleDelete();
    },
    onShowEndorsements: () => setTab("endorsements"),
  });

  async function handleDelete() {
    if (!(await confirmDialog("Delete this transaction? This cannot be undone."))) return;
    try {
      await api.delete(`/api/transactions/${txId}`);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      navigate("/transactions");
    } catch (err) {
      void alertDialog(err instanceof Error ? err.message : "Could not delete transaction.");
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Transaction not found.</p>;
  const t = data.transaction;
  const { parent, effectiveTerms, originatingQuote, premiumInvoice, commissionReceived, complianceExceptions } = data;

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview" },
    { id: "commission", label: "Commission splits" },
    ...(parent ? [] : [{ id: "endorsements", label: "Endorsements", count: data.endorsementNotes.length }]),
    ...(parent || !pbAccess.hasAny ? [] : [{ id: "wording", label: "Policy wording" }]),
    { id: "ledger", label: "Ledger timeline" },
  ];
  const tab = tabs.some((x) => x.id === searchParams.get("tab")) ? (searchParams.get("tab") as string) : "overview";
  function setTab(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  }

  const metrics: Metric[] = [
    { key: "due", label: "Premium due", value: fmtMoneyShort(t.premium_due), title: fmtMoney(t.premium_due) },
    { key: "paid", label: "Premium paid", value: fmtMoneyShort(t.premium_paid), title: fmtMoney(t.premium_paid), tone: t.premium_paid > 0 ? "good" : "neutral" },
    {
      key: "balance",
      label: "Balance O/S",
      value: fmtMoneyShort(t.balance_os),
      title: fmtMoney(t.balance_os),
      tone: t.balance_os > 0.01 ? "crit" : "good",
      note: t.billing_mode === "Direct" ? "Direct Bill: insurer collects" : undefined,
    },
    { key: "brokerage", label: "Total brokerage", value: fmtMoneyShort(t.total_brokerage), title: fmtMoney(t.total_brokerage), tone: "good" },
    { key: "received", label: "Commission received", value: fmtMoneyShort(commissionReceived.total), title: fmtMoney(commissionReceived.total), note: `${commissionReceived.statements.length} statement${commissionReceived.statements.length === 1 ? "" : "s"}` },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">{t.credit_note_no || "—"}</span>
          <h1>{t.policy_no || "Untitled policy"}</h1>
        </div>
        <div className="exec-meta">
          <StatusBadge status={t.status} />
          <Link to={`/clients/${t.client_id}`}>{t.client_name}</Link>
          <span>
            {t.start_date || "—"} → {t.end_date || "—"}
          </span>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <button
              type="button"
              className="btn-secondary btn btn-sm"
              onClick={() => navigate(`/receipts/new?client_id=${t.client_id}&transaction_id=${txId}`)}
            >
              {/* Fully-paid policies can still be receipted (the payment was
                  recorded on the transaction itself, the import or Paystack,
                  none of which produce a receipt document) — only the label
                  changes, the destination is the same form. */}
              {t.balance_os > 0.01 ? "Record Payment" : "Generate Receipt"}
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => policyMod.attempt("EDIT")}>
              {policyMod.lock?.locked ? "Edit / Endorse" : "Edit"}
            </button>
            {!t.parent_transaction_id && (
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/policy-bank/builder/new?transactionId=${txId}`)}>
                Build policy wording
              </button>
            )}
            <button type="button" className="btn-danger btn btn-sm" onClick={() => policyMod.attempt("DELETE")}>
              {policyMod.lock?.locked ? "Void / Delete" : "Delete"}
            </button>
          </div>
        </RoleGate>
      </header>

      {parent && (
        <div className="flash flash-info">
          Endorsement note for policy{" "}
          <Link to={`/transactions/${parent.id}`}>{parent.policy_no || parent.credit_note_no || `#${parent.id}`}</Link>. It records
          only the change the endorsement made. Void it by setting its status to Cancelled.
        </div>
      )}

      {!t.parent_transaction_id && <CoverPanel txId={Number(txId)} />}
      {policyMod.ui}

      <MetricStrip metrics={metrics} label="Policy financial summary" />

      <section className="exec-workspace" aria-label="Policy workspace">
        <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="tx" label="Policy views" />

      {tab === "overview" && (
      <div role="tabpanel" id="tx-panel-overview" aria-labelledby="tx-tab-overview" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Overview</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Client</div>
            <div className="v">
              <Link to={`/clients/${t.client_id}`}>{t.client_name}</Link>
            </div>
          </div>
          <div>
            <div className="k">Insurer</div>
            <div className="v">
              <Link to={`/insurers/${t.insurer_id}`}>{t.insurer_name}</Link>
            </div>
          </div>
          <div>
            <div className="k">Class of business</div>
            <div className="v">{t.class_of_business || "—"}</div>
          </div>
          <div>
            <div className="k">Business type</div>
            <div className="v">{t.business_type || "—"}</div>
          </div>
          <div>
            <div className="k">Transaction date</div>
            <div className="v">{t.trans_date || "—"}</div>
          </div>
          <div>
            <div className="k">Policy period</div>
            <div className="v">
              {t.start_date || "—"} → {t.end_date || "—"}
            </div>
          </div>
          <div>
            <div className="k">Status</div>
            <div className="v">
              <StatusBadge status={t.status} />
            </div>
          </div>
          <div>
            <div className="k">Producer</div>
            <div className="v">{t.producer || "—"}</div>
          </div>
          <div>
            <div className="k">Billing</div>
            <div className="v">{t.billing_mode === "Direct" ? "Direct Bill (insurer collects)" : "Agency Bill"}</div>
          </div>
          {t.billing_mode !== "Direct" && (
            <div>
              <div className="k">Premium due by</div>
              <div className="v">{t.payment_due_date || "—"}</div>
            </div>
          )}
          {originatingQuote && (
            <div>
              <div className="k">Originating quote</div>
              <div className="v">
                {originatingQuote.deal_id ? <Link to={`/deals/${originatingQuote.deal_id}?tab=quotes`}>{originatingQuote.submission_no}</Link> : originatingQuote.submission_no}
                {originatingQuote.quote_id
                  ? ` — ${originatingQuote.insurer_name}, ${fmtMoney(originatingQuote.premium ?? 0)}${originatingQuote.quote_reference ? ` (${originatingQuote.quote_reference})` : ""}`
                  : ""}
              </div>
            </div>
          )}
        </div>
      </div>

      <RiskItemsCard items={data.riskItems ?? []} />
      {!data.transaction.parent_transaction_id && (
        <ScheduleView classOfBusiness={data.transaction.class_of_business ?? ""} riskSchedule={data.riskSchedule ?? null} />
      )}

      <div className="card">
        <h2>Financials</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Sum insured</div>
            <div className="v">{fmtMoney(t.sum_insured)}</div>
          </div>
          {t.tppd_limit !== null && t.tppd_limit !== undefined && (
            <div>
              <div className="k">TPPD limit</div>
              <div className="v">{fmtMoney(t.tppd_limit)}</div>
            </div>
          )}
          <div>
            <div className="k">Premium due</div>
            <div className="v">{fmtMoney(t.premium_due)}</div>
          </div>
          <div>
            <div className="k">Premium paid</div>
            <div className="v">{fmtMoney(t.premium_paid)}</div>
          </div>
          <div>
            <div className="k">Balance O/S</div>
            <div className="v">{fmtMoney(t.balance_os)}</div>
          </div>
          <div>
            <div className="k">Brokerage</div>
            <div className="v">{fmtMoney(t.brokerage)}</div>
          </div>
          <div>
            <div className="k">Co-brokers</div>
            <div className="v">{fmtMoney(t.co_brokers)}</div>
          </div>
          <div>
            <div className="k">Total brokerage</div>
            <div className="v">{fmtMoney(t.total_brokerage)}</div>
          </div>
          <div>
            <div className="k">Net premium</div>
            <div className="v">{fmtMoney(t.net_premium)}</div>
          </div>
          <div>
            <div className="k">Commission earned</div>
            <div className="v">{fmtMoney(t.commission_earned)}</div>
          </div>
          <div>
            <div className="k">Deferred commission</div>
            <div className="v">{fmtMoney(t.deferred_commission)}</div>
          </div>
          <div>
            <div className="k">Commission received (insurer statements)</div>
            <div className="v">
              {fmtMoney(commissionReceived.total)}
              {commissionReceived.statements.map((s) => (
                <div key={s.statementId}>
                  <small>
                    <Link to={`/commission-statements/${s.statementId}`}>{s.statementRef || `Statement #${s.statementId}`}</Link>
                    {": "}
                    {fmtMoney(s.amount)} on {s.depositDate}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="k">Date of payment</div>
            <div className="v">{t.date_of_payment || "—"}</div>
          </div>
        </div>
        {effectiveTerms && (
          <>
            <div className="section-title">Effective terms including endorsements</div>
            <div className="detail-grid">
              <div>
                <div className="k">Sum insured</div>
                <div className="v">{fmtMoney(effectiveTerms.sum_insured)}</div>
              </div>
              <div>
                <div className="k">Premium due</div>
                <div className="v">{fmtMoney(effectiveTerms.premium_due)}</div>
              </div>
              <div>
                <div className="k">Total brokerage</div>
                <div className="v">{fmtMoney(effectiveTerms.total_brokerage)}</div>
              </div>
              <div>
                <div className="k">Net premium</div>
                <div className="v">{fmtMoney(effectiveTerms.net_premium)}</div>
              </div>
            </div>
          </>
        )}
        {t.transaction_narration && (
          <>
            <div className="section-title">Narration</div>
            <p>{t.transaction_narration}</p>
          </>
        )}
      </div>

      {complianceExceptions.length > 0 && (
        <div className="card">
          <h2>Compliance exceptions</h2>
          <ul>
            {complianceExceptions.map((e) => (
              <li key={e.id}>
                <StatusBadge status={e.status === "Overridden" ? "Overridden" : e.severity === "block" ? "Blocked" : "Warning"} />{" "}
                <strong>{e.rule_name}</strong>: {e.message}
                {e.status === "Overridden" && (
                  <small>
                    {" "}
                    (overridden by {e.overridden_by}: {e.override_reason})
                  </small>
                )}
              </li>
            ))}
          </ul>
          <Link to="/policy-compliance">All compliance exceptions</Link>
        </div>
      )}

      {premiumInvoice && (
        <div className="card">
          <h2>Unpaid premium invoice</h2>
          <div className="detail-grid">
            <div>
              <div className="k">Debit note</div>
              <div className="v">
                <a
                  href={apiUrl(`/api/premium-invoices/debit-note.pdf?key=${encodeURIComponent(premiumInvoice.invoiceKey)}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {premiumInvoice.debitNoteNo || "No number"}
                </a>
              </div>
            </div>
            <div>
              <div className="k">Amount due on this invoice</div>
              <div className="v">{fmtMoney(premiumInvoice.amountDue)}</div>
            </div>
            <div>
              <div className="k">Due</div>
              <div className="v">
                {premiumInvoice.dueDate || "—"} <OverdueBadge invoice={premiumInvoice} />
              </div>
            </div>
            <div>
              <div className="k">Reminders sent</div>
              <div className="v">
                {premiumInvoice.reminders.length
                  ? premiumInvoice.reminders.map((r) => `${REMINDER_LABELS[r.stage] || r.stage} (${r.created_at.slice(0, 10)})`).join(", ")
                  : "None yet"}
              </div>
            </div>
          </div>
          {premiumInvoice.policies.length > 1 && (
            <p>This debit note also covers {premiumInvoice.policies.length - 1} other unpaid polic{premiumInvoice.policies.length === 2 ? "y" : "ies"} for this client.</p>
          )}
        </div>
      )}

      </div>
      )}

      {tab === "commission" && (
        <div role="tabpanel" id="tx-panel-commission" aria-labelledby="tx-tab-commission" tabIndex={0} className="exec-tabpanel">
          <CommissionSplitsPanel txId={txId!} />
          <SubBrokerPanel txId={txId!} isNote={Boolean(parent)} />
        </div>
      )}

      {tab === "wording" && !parent && (
        <div role="tabpanel" id="tx-panel-wording" aria-labelledby="tx-tab-wording" tabIndex={0} className="exec-tabpanel">
          <PolicyWordingPanel transactionId={Number(txId)} />
        </div>
      )}

      {tab === "ledger" && (
        <div role="tabpanel" id="tx-panel-ledger" aria-labelledby="tx-tab-ledger" tabIndex={0} className="exec-tabpanel">
          <PolicyLedgerTimeline txId={Number(txId)} />
        </div>
      )}

      {tab === "endorsements" && !parent && (
        <div role="tabpanel" id="tx-panel-endorsements" aria-labelledby="tx-tab-endorsements" tabIndex={0} className="exec-tabpanel">
          <EndorsementPanel txId={txId!} />
        </div>
      )}
      </section>
    </div>
  );
}

// Multi-split commission ledger: Writing Agent / Referral / Agency / Other
// percentages of this transaction's total_brokerage ("Agency Gross
// Commission"). Amounts are computed server-side in integer cents
// (lib/commissionSplits.js) — this panel only edits percentages.
function CommissionSplitsPanel({ txId }: { txId: string }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<{ splitType: string; payeeName: string; percentage: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", txId, "commission-splits"],
    queryFn: () => api.get<CommissionLedger>(`/api/transactions/${txId}/commission-splits`),
  });

  const editing = rows !== null;
  const displayRows =
    rows ?? (data?.splits.map((s) => ({ splitType: s.splitType, payeeName: s.payeeName || "", percentage: String(s.percentage) })) || []);

  function startEditing() {
    setError(null);
    setRows(
      data?.splits.length
        ? data.splits.map((s) => ({ splitType: s.splitType, payeeName: s.payeeName || "", percentage: String(s.percentage) }))
        : [{ splitType: "WritingAgent", payeeName: "", percentage: "" }]
    );
  }

  function updateRow(index: number, patch: Partial<{ splitType: string; payeeName: string; percentage: string }>) {
    setRows((prev) => prev!.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...(prev || []), { splitType: "Referral", payeeName: "", percentage: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev!.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.put(`/api/transactions/${txId}/commission-splits`, {
        splits: (rows || []).map((row) => ({
          splitType: row.splitType,
          payeeName: row.payeeName || null,
          percentage: Number(row.percentage) || 0,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ["transactions", txId, "commission-splits"] });
      setRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save commission splits.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Commission splits</h2>
        <RoleGate need="write">
          {editing ? (
            <div className="page-header-actions">
              <button type="button" className="btn" onClick={handleSave} disabled={saving}>
                Save
              </button>
              <button type="button" className="btn-secondary btn" onClick={() => setRows(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary btn" onClick={startEditing}>
              Edit splits
            </button>
          )}
        </RoleGate>
      </div>
      {error && <div className="flash flash-error">{error}</div>}
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="detail-grid">
            <div>
              <div className="k">Gross premium</div>
              <div className="v">{fmtMoney(data?.grossPremium || 0)}</div>
            </div>
            <div>
              <div className="k">Carrier net premium</div>
              <div className="v">{fmtMoney(data?.carrierNetPremium || 0)}</div>
            </div>
            <div>
              <div className="k">Agency gross commission</div>
              <div className="v">{fmtMoney(data?.agencyGrossCommission || 0)}</div>
            </div>
          </div>
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Split type</th>
                  <th>Payee</th>
                  <th className="num">Percentage</th>
                  <th className="num">Amount</th>
                  {editing && <th></th>}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={editing ? 5 : 4} className="empty-state">
                      No commission splits recorded — full commission is retained by the agency.
                    </td>
                  </tr>
                )}
                {displayRows.map((row, index) =>
                  editing ? (
                    <tr key={index}>
                      <td>
                        <select value={row.splitType} onChange={(e) => updateRow(index, { splitType: e.target.value })}>
                          {SPLIT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input value={row.payeeName} onChange={(e) => updateRow(index, { payeeName: e.target.value })} />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          value={row.percentage}
                          onChange={(e) => updateRow(index, { percentage: e.target.value })}
                        />
                      </td>
                      <td className="num">—</td>
                      <td>
                        <button type="button" className="btn-danger btn" onClick={() => removeRow(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={index}>
                      <td>{row.splitType}</td>
                      <td>{row.payeeName || "—"}</td>
                      <td className="num">{row.percentage}%</td>
                      <td className="num">{fmtMoney(data?.splits[index]?.amount || 0)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          {editing && (
            <button type="button" className="btn-secondary btn" onClick={addRow}>
              + Add split
            </button>
          )}
          {!editing && data && (
            <p>
              Unallocated (retained by agency): <strong>{fmtMoney(data.unallocated)}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}

const EMPTY_ENDORSEMENT_FORM = { effective_date: "", requested_date: "", premium_delta: "", sum_insured: "", subject_matter: "", summary: "" };

// Endorsement Engine: books a midterm modification as a separate adjustment
// note (additional/return premium, pro-rated by remaining term days, dated on
// the effective date), archiving the prior effective terms. This policy's
// own row is never changed (backend/src/lib/endorsements.js).
function EndorsementPanel({ txId }: { txId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_ENDORSEMENT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", txId, "endorsements"],
    queryFn: () => api.get<EndorsementsResponse>(`/api/transactions/${txId}/endorsements`),
  });

  async function handleSubmit() {
    setError(null);
    if (!form.effective_date) {
      setError("An effective date is required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/transactions/${txId}/endorsements`, {
        effective_date: form.effective_date,
        requested_date: form.requested_date || undefined,
        premium_delta: form.premium_delta || 0,
        sum_insured: form.sum_insured || undefined,
        subject_matter: form.subject_matter || undefined,
        summary: form.summary || undefined,
      });
      setForm(EMPTY_ENDORSEMENT_FORM);
      setShowForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", txId] }),
        queryClient.invalidateQueries({ queryKey: ["transactions", txId, "endorsements"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions", txId, "commission-splits"] }),
        // The new note is its own transaction row; refresh the list views too.
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply endorsement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Endorsements</h2>
        <RoleGate need="write">
          <button type="button" className="btn-secondary btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ New endorsement"}
          </button>
        </RoleGate>
      </div>

      {showForm && (
        <>
          {error && <div className="flash flash-error">{error}</div>}
          <div className="form-grid">
            <label>
              Effective date
              <input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </label>
            <label>
              Requested on
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.requested_date}
                onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
              />
              <small>The day the client asked for it. Used to measure turnaround.</small>
            </label>
            <label>
              Additional/return premium (full-term)
              <input
                type="number"
                value={form.premium_delta}
                onChange={(e) => setForm({ ...form, premium_delta: e.target.value })}
                placeholder="e.g. 1000 or -500"
              />
            </label>
            <label>
              New sum insured (optional)
              <input type="number" value={form.sum_insured} onChange={(e) => setForm({ ...form, sum_insured: e.target.value })} />
            </label>
            <label>
              New subject matter (optional)
              <input value={form.subject_matter} onChange={(e) => setForm({ ...form, subject_matter: e.target.value })} />
            </label>
            <label>
              Summary
              <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="e.g. Sum insured increase" />
            </label>
          </div>
          <button type="button" className="btn" onClick={handleSubmit} disabled={submitting}>
            Apply endorsement
          </button>
        </>
      )}

      {isLoading ? (
        <p>Loading…</p>
      ) : !data || data.events.length === 0 ? (
        <p>No endorsements recorded for this policy.</p>
      ) : (
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Effective date</th>
                <th>Recorded</th>
                <th>Summary</th>
                <th className="num">Premium adjustment</th>
                <th>Adjustment note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.effective_date || "—"}</td>
                  <td>{ev.event_date}</td>
                  <td>{ev.summary}</td>
                  <td className="num">{ev.note_premium_due == null ? "—" : fmtMoney(ev.note_premium_due)}</td>
                  <td>
                    {ev.endorsement_transaction_id ? (
                      <>
                        <Link to={`/transactions/${ev.endorsement_transaction_id}`}>
                          {ev.note_credit_note_no || `#${ev.endorsement_transaction_id}`}
                        </Link>
                        {ev.note_status === "Cancelled" && <> <StatusBadge status="Cancelled" /></>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <a href={apiUrl(`/api/transactions/${txId}/endorsements/${ev.id}/document.pdf`)} target="_blank" rel="noreferrer">
                      Document
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

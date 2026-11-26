import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { OverdueBadge } from "@/shared/components/OverdueBadge";
import { REMINDER_LABELS, type PremiumInvoice, type PremiumInvoicesResponse } from "../lib/premiumInvoices";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { InstalmentPlanModal } from "../components/InstalmentPlanModal";

// Open Agency Bill premium invoices (debit notes). Backend: lib/premiumInvoices.js.
export function PremiumInvoicesPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue">("overdue");
  const [planFor, setPlanFor] = useState<PremiumInvoice | null>(null);
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["premium-invoices"],
    queryFn: () => api.get<PremiumInvoicesResponse>("/api/premium-invoices"),
  });

  async function runReminders() {
    setMessage(null);
    try {
      const result = await api.post<{ remindersCreated: number }>("/api/premium-invoices/run-reminders");
      setMessage(
        result.remindersCreated
          ? `${result.remindersCreated} reminder task(s) created.`
          : "No reminders were due. Each stage is sent once per invoice."
      );
      await queryClient.invalidateQueries({ queryKey: ["premium-invoices"] });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not run reminders.");
    }
  }

  const rows = (data?.invoices ?? []).filter((inv) => filter === "all" || inv.isOverdue);
  const search = useRowSearch(rows, (inv) => [inv.clientName, inv.debitNoteNo, ...inv.policies.flatMap((p) => [p.policyNo, p.insurerName, p.classOfBusiness])]);
  const columns: DataGridColumn<PremiumInvoice>[] = [
    {
      key: "dn",
      header: "Debit note",
      render: (inv) => (
        <a href={apiUrl(`/api/premium-invoices/debit-note.pdf?key=${encodeURIComponent(inv.invoiceKey)}`)} target="_blank" rel="noreferrer">
          {inv.debitNoteNo || "No number"}
        </a>
      ),
    },
    { key: "client", header: "Client", render: (inv) => <Link to={`/clients/${inv.clientId}`}>{inv.clientName}</Link> },
    {
      key: "policies",
      header: "Policies",
      render: (inv) =>
        inv.policies.map((p, i) => (
          <span key={p.transactionId}>
            {i > 0 && ", "}
            <Link to={`/transactions/${p.transactionId}`}>{p.policyNo || `#${p.transactionId}`}</Link>
          </span>
        )),
    },
    {
      key: "amount",
      header: "Amount due",
      render: (inv) => (
        <>
          {fmtMoney(inv.amountDue)}
          {inv.plan?.current && <div className="text-muted" style={{ fontSize: "0.8rem" }}>Instalment {inv.plan.current.seq} of {inv.plan.instalments.length}: {fmtMoney(inv.plan.current.unpaid)}</div>}
        </>
      ),
    },
    { key: "due", header: "Due", render: (inv) => inv.dueDate || "—" },
    { key: "status", header: "Status", render: (inv) => <OverdueBadge invoice={inv} /> },
    {
      key: "plan",
      header: "Instalments",
      render: (inv) =>
        inv.plan ? (
          <button type="button" className="link-button" onClick={() => setPlanFor(inv)}>Plan of {inv.plan.instalments.length}</button>
        ) : user?.canWrite ? (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPlanFor(inv)}>Set up</button>
        ) : (
          "—"
        ),
    },
    {
      key: "reminders",
      header: "Reminders sent",
      render: (inv) =>
        inv.reminders.length
          ? inv.reminders.map((r) => `${REMINDER_LABELS[r.stage] || r.stage} (${r.created_at.slice(0, 10)})`).join(", ")
          : "—",
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Premium Invoices</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Unpaid Agency Bill debit notes. A chase task goes to the client's account manager automatically at 15 and 30 days
            overdue. Direct Bill policies aren't listed: their premium is paid to the insurer.
          </p>
        </div>
        <RoleGate need="write">
          <div className="page-header-actions">
            <button type="button" className="btn-secondary btn" onClick={runReminders}>
              Run reminders now
            </button>
          </div>
        </RoleGate>
      </div>

      {message && <div className="flash flash-info">{message}</div>}

      {data && (
        <div className="detail-grid card">
          <div>
            <div className="k">Open invoices</div>
            <div className="v">{data.totals.count}</div>
          </div>
          <div>
            <div className="k">Total due</div>
            <div className="v">{fmtMoney(data.totals.amountDue)}</div>
          </div>
          <div>
            <div className="k">Overdue invoices</div>
            <div className="v">{data.totals.overdueCount}</div>
          </div>
          <div>
            <div className="k">Overdue amount</div>
            <div className="v">{fmtMoney(data.totals.overdueAmount)}</div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "overdue")}>
          <option value="overdue">Overdue only</option>
          <option value="all">All open invoices</option>
        </select>
      </div>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Client, debit note, policy no or insurer…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(inv) => inv.invoiceKey}
        emptyMessage={filter === "overdue" ? "No overdue premium invoices." : "No open premium invoices."}
      />
      {planFor && <InstalmentPlanModal invoice={planFor} canWrite={Boolean(user?.canWrite)} onClose={() => setPlanFor(null)} />}
    </div>
  );
}

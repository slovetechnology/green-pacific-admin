import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { Panel } from "@/shared/components/exec/Panel";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { alertDialog, confirmDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/executive.css";

interface Insurer {
  id: number;
  name: string;
  insurer_ref: string | null;
  address: string | null;
  quote_email?: string | null;
  licence_no?: string | null;
  insurer_class?: string | null;
}

interface TransactionRow {
  id: number;
  trans_date: string | null;
  policy_no: string | null;
  client_name: string;
  class_of_business: string | null;
  premium_due: number;
  balance_os: number;
  total_brokerage: number;
  status: string | null;
}

export function InsurerDetailPage() {
  const { insurerId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["insurers", insurerId],
    queryFn: () => api.get<{ insurer: Insurer; transactions: TransactionRow[] }>(`/api/insurers/${insurerId}`),
  });

  async function handleDelete() {
    if (!(await confirmDialog("Delete this insurer? This cannot be undone."))) return;
    try {
      await api.delete(`/api/insurers/${insurerId}`);
      await queryClient.invalidateQueries({ queryKey: ["insurers"] });
      navigate("/insurers");
    } catch (err) {
      void alertDialog(err instanceof Error ? err.message : "Could not delete insurer.");
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Insurer not found.</p>;
  const { insurer, transactions } = data;

  const premium = transactions.reduce((sum, t) => sum + (Number(t.premium_due) || 0), 0);
  const owed = transactions.reduce((sum, t) => sum + Math.max(0, Number(t.balance_os) || 0), 0);
  const brokerage = transactions.reduce((sum, t) => sum + (Number(t.total_brokerage) || 0), 0);
  const collected = premium > 0 ? ((premium - owed) / premium) * 100 : null;
  const metrics: Metric[] = [
    { key: "policies", label: "Policies", value: transactions.length.toLocaleString() },
    { key: "premium", label: "Premium placed", value: fmtMoneyShort(premium), title: fmtMoney(premium) },
    { key: "brokerage", label: "Total brokerage", value: fmtMoneyShort(brokerage), title: fmtMoney(brokerage), tone: "good" },
    { key: "owed", label: "Balance O/S", value: fmtMoneyShort(owed), title: fmtMoney(owed), tone: owed > 0 ? "crit" : "good" },
    {
      key: "collected",
      label: "Collected",
      value: collected === null ? "—" : `${collected.toFixed(1)}%`,
      tone: collected === null ? "neutral" : collected >= 90 ? "good" : collected >= 60 ? "warn" : "crit",
    },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">{insurer.insurer_ref || "—"}</span>
          <h1>{insurer.name}</h1>
        </div>
        <div className="exec-meta">
          <span>Licence {insurer.licence_no || "not recorded"}{insurer.insurer_class ? ` · ${insurer.insurer_class}` : ""}</span>
          <span>{insurer.address || "No address on file"}</span>
          <span>Quote requests: {insurer.quote_email || "no email on file"}</span>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <Link className="btn-secondary btn btn-sm" to={`/policy-bank/insurer-wordings?insurerId=${insurerId}`}>
              Policy wordings
            </Link>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/insurers/${insurerId}/edit`)}>
              Edit
            </button>
            <button type="button" className="btn-danger btn btn-sm" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </RoleGate>
      </header>

      <MetricStrip metrics={metrics} label="Insurer summary" />

      <Panel eyebrow="Ledger" title="Transactions" flush>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Policy No</th>
                <th scope="col">Client</th>
                <th scope="col">Class</th>
                <th scope="col" className="num">Premium Due</th>
                <th scope="col" className="num">Balance O/S</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="exec-empty">
                    No transactions yet.
                  </td>
                </tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">
                    <Link to={`/transactions/${t.id}`}>{t.trans_date || "—"}</Link>
                  </td>
                  <td className="nowrap">{t.policy_no || "—"}</td>
                  <td className="wrap">{t.client_name}</td>
                  <td>{t.class_of_business || "—"}</td>
                  <td className="num">{fmtMoney(t.premium_due)}</td>
                  <td className={`num${t.balance_os > 0 ? " is-crit" : ""}`}>{fmtMoney(t.balance_os)}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

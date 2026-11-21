import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import { useSubBrokerMeta, type SubBroker } from "../lib/subBrokers";
import { SplitsTab } from "../components/SplitsTab";
import { AuditTab, BusinessTab, DocumentsTab, PaymentsTab, StatementTab } from "../components/LedgerTabs";
import { confirmDialog } from "@/shared/components/Dialogs";
import "@/shared/styles/executive.css";

interface Totals {
  policies: number; premium: number; grossCommission: number; grossShare: number; vat: number; naicomLevy: number; misc: number;
  deductions: number; net: number; totalPaid: number; outstanding: number; payableNow: number;
}

const NEXT_STATUS: Record<string, string[]> = { Active: ["Suspended", "Terminated"], Suspended: ["Active", "Terminated"], Terminated: [] };

function ProfileTab({ sb }: { sb: SubBroker }) {
  const queryClient = useQueryClient();
  const { can } = useSubBrokerMeta();
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: () => api.post(`/api/sub-brokers/${sb.id}/status`, { status, reason }),
    onSuccess: () => { setStatus(""); setReason(""); setError(null); queryClient.invalidateQueries({ queryKey: ["sub-brokers"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not change the status."),
  });
  const kv = (k: string, v: React.ReactNode) => (<div><div className="k">{k}</div><div className="v">{v || "—"}</div></div>);
  const next = NEXT_STATUS[sb.status] ?? [];
  return (
    <div role="tabpanel" id="sb-panel-profile" aria-labelledby="sb-tab-profile" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Profile</h2>
        <div className="detail-grid">
          {kv("Type", sb.type)}
          {kv("Contact person", sb.contact_person)}
          {kv("Phone", sb.phone)}
          {kv("Email", sb.email)}
          {kv("Address", sb.address)}
          {kv("State", sb.state)}
          {kv("RC number", sb.rc_number)}
          {kv("TIN", sb.tin)}
          {kv("Partnership date", sb.onboarded_on)}
          {kv("Relationship officer", sb.relationship_officer)}
          {kv("Registered by", sb.created_by)}
          {kv("Converted from agent login", sb.legacy_agency_id ? `#${sb.legacy_agency_id}` : null)}
        </div>
        {sb.notes && <p style={{ marginTop: "1rem" }}>{sb.notes}</p>}
      </div>
      <div className="card">
        <h2>Payout bank details</h2>
        <div className="detail-grid">
          {kv("Bank", sb.bank_name)}
          {kv("Account name", sb.account_name)}
          {kv("Account number", sb.account_number)}
        </div>
        {!sb.bank_visible && sb.account_number && <p className="muted">The full account number is shown only to users who can make payments.</p>}
      </div>
      {can("subbroker.edit") && next.length > 0 && (
        <div className="card">
          <h2>Change status</h2>
          <p className="muted">Suspended and terminated sub-brokers can't be attached to new business. Their history stays. Termination is final.</p>
          {error && <div className="flash flash-error">{error}</div>}
          <div className="toolbar">
            <select aria-label="New status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Move to…</option>
              {next.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minWidth: "18rem" }} />
            <button type="button" className={status === "Terminated" ? "btn btn-danger" : "btn"} disabled={!status || !reason.trim() || change.isPending}
              onClick={async () => { if (status !== "Terminated" || (await confirmDialog(`Terminate ${sb.name}? This cannot be undone.`))) change.mutate(); }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubBrokerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "profile";
  const { can } = useSubBrokerMeta();

  const sbQuery = useQuery({
    queryKey: ["sub-brokers", id],
    queryFn: () => api.get<{ subBroker: SubBroker }>(`/api/sub-brokers/${id}`),
  });
  const totals = useQuery({
    queryKey: ["sub-brokers", id, "totals"],
    queryFn: () => api.get<{ totals: Totals }>(`/api/sub-brokers/${id}/totals`),
  });

  if (sbQuery.isLoading) return <p className="exec-state">Loading…</p>;
  if (sbQuery.isError || !sbQuery.data) return <div className="flash flash-error">Sub-broker not found, or you don't have access.</div>;
  const sb = sbQuery.data.subBroker;
  const t = totals.data?.totals;

  const metrics: Metric[] = [
    { key: "policies", label: "Policies", value: (t?.policies ?? 0).toLocaleString(), note: t ? `Premium ${fmtMoneyShort(t.premium)}` : undefined },
    { key: "gross", label: "Gross share", value: fmtMoneyShort(t?.grossShare), title: fmtMoney(t?.grossShare) },
    { key: "ded", label: "Deductions", value: fmtMoneyShort(t?.deductions), title: t ? `VAT ${fmtMoney(t.vat)} · NAICOM levy ${fmtMoney(t.naicomLevy)} · Misc ${fmtMoney(t.misc)}` : undefined },
    { key: "paid", label: "Paid", value: fmtMoneyShort(t?.totalPaid), title: fmtMoney(t?.totalPaid), tone: "good" },
    { key: "out", label: "Outstanding", value: fmtMoneyShort(t?.outstanding), title: fmtMoney(t?.outstanding), tone: (t?.outstanding ?? 0) > 0 ? "warn" : "neutral", note: t ? `Payable now ${fmtMoneyShort(t.payableNow)}` : undefined },
  ];
  const tabs: TabDef[] = [
    { id: "profile", label: "Profile" },
    { id: "splits", label: "Commission Splits" },
    { id: "business", label: "Business", count: t?.policies },
    { id: "statement", label: "Statement" },
    { id: "payments", label: "Payments" },
    { id: "documents", label: "Documents" },
    { id: "audit", label: "Audit" },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">{sb.reference_no}</span>
          <h1>{sb.name} <StatusBadge status={sb.status} /></h1>
        </div>
        <div className="exec-header-actions">
          <Link className="btn-secondary btn btn-sm" to="/sub-brokers">All sub-brokers</Link>
          {can("subbroker.edit") && <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/sub-brokers/${sb.id}/edit`)}>Edit</button>}
          {can("subbroker.pay") && sb.status !== "Terminated" && <Link className="btn btn-sm" to={`/sub-brokers/${sb.id}/pay`}>Pay commission</Link>}
        </div>
      </header>
      <MetricStrip metrics={metrics} label="Sub-broker totals" />
      <section className="exec-workspace" aria-label="Sub-broker workspace">
        <Tabs tabs={tabs} active={tab} onChange={(next) => setParams({ tab: next })} idPrefix="sb" label="Sub-broker views" />
        {tab === "profile" && <ProfileTab sb={sb} />}
        {tab === "splits" && <SplitsTab subBroker={sb} />}
        {tab === "business" && <BusinessTab subBroker={sb} />}
        {tab === "statement" && <StatementTab subBroker={sb} />}
        {tab === "payments" && <PaymentsTab subBroker={sb} />}
        {tab === "documents" && <DocumentsTab subBroker={sb} />}
        {tab === "audit" && <AuditTab subBroker={sb} />}
      </section>
    </div>
  );
}

import { Link } from "react-router";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import "@/shared/styles/executive.css";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

interface Alert {
  id: number; policy_no: string; class_of_business: string; end_date: string;
  premium_due: number; status: string; business_type: string; client_name: string;
  insurer_name: string; days_to_expiry: number; bucket: string; bucket_label: string;
}
interface Response {
  alerts: Alert[];
  counts: { overdue: number; urgent: number; upcoming: number; total: number };
  premium: { overdue: number; urgent: number; upcoming: number; total: number };
  lookbackDays: number;
  lookaheadDays: number;
  urgentDays: number;
}

interface RenewalSummary {
  policySummary: {
    policyNo: string | null;
    client: string;
    insurer: string;
    classOfBusiness: string | null;
    sumInsured: number;
    premiumDue: number;
    policyPeriod: { start: string | null; end: string | null };
  };
  emailDraft: { subject: string; body: string };
}

const BUCKET_TONE: Record<string, string> = { overdue: "is-crit", urgent: "is-warn", upcoming: "" };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked (insecure origin); the text stays selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function RenewalDrawerBody({ id }: { id: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["renewals", id, "summary"],
    queryFn: () => api.get<RenewalSummary>(`/api/renewals/${id}/summary`),
  });
  if (isLoading) return <p className="exec-state">Loading…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load a renewal summary for this policy.</p>;

  const p = data.policySummary;
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Client</dt><dd>{p.client}</dd></div>
        <div className="exec-field"><dt>Policy no.</dt><dd>{p.policyNo || "—"}</dd></div>
        <div className="exec-field"><dt>Insurer</dt><dd>{p.insurer}</dd></div>
        <div className="exec-field"><dt>Class</dt><dd>{p.classOfBusiness || "—"}</dd></div>
        <div className="exec-field"><dt>Period</dt><dd>{p.policyPeriod.start || "—"} → {p.policyPeriod.end || "—"}</dd></div>
        <div className="exec-field"><dt>Sum insured</dt><dd>{fmtMoney(p.sumInsured)}</dd></div>
        <div className="exec-field"><dt>Premium due</dt><dd>{fmtMoney(p.premiumDue)}</dd></div>
      </dl>

      <section>
        <h3 className="exec-sub">Email subject</h3>
        <p className="exec-terms">{data.emailDraft.subject}</p>
      </section>
      <section>
        <h3 className="exec-sub">Email body</h3>
        <p className="exec-terms">{data.emailDraft.body}</p>
      </section>
      <div className="exec-row-actions">
        <CopyButton text={data.emailDraft.subject} label="Copy subject" />
        <CopyButton text={data.emailDraft.body} label="Copy body" />
      </div>
    </>
  );
}

export function RenewalsPage() {
  const [selected, setSelected] = useState<Alert | null>(null);
  const [bucket, setBucket] = useState("");
  const closeDrawer = useCallback(() => setSelected(null), []);
  const { data, isLoading } = useQuery({
    queryKey: ["renewals"],
    queryFn: () => api.get<Response>("/api/renewals"),
  });

  const columns: DataGridColumn<Alert>[] = [
    { key: "client", header: "Client", render: (a) => a.client_name },
    { key: "policy_no", header: "Policy No", render: (a) => <Link to={`/transactions/${a.id}`}>{a.policy_no || "—"}</Link> },
    { key: "class", header: "Class", render: (a) => a.class_of_business },
    { key: "insurer", header: "Insurer", render: (a) => a.insurer_name },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "premium_due", header: "Premium Due", align: "right", render: (a) => fmtMoney(a.premium_due) },
    { key: "expiry", header: "Expiry", render: (a) => <span className="nowrap">{a.end_date}</span> },
    {
      key: "alert",
      header: "Alert",
      render: (a) => (
        <span className={`exec-num ${BUCKET_TONE[a.bucket] ?? ""}`} style={{ fontSize: "inherit" }}>
          {a.bucket_label} ({a.days_to_expiry}d)
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (a) => (
        <button type="button" className="exec-rowbtn" onClick={() => setSelected(a)} aria-label={`Draft renewal email for ${a.client_name}`}>
          Draft email
        </button>
      ),
    },
  ];

  const rows = (data?.alerts ?? []).filter((a) => !bucket || a.bucket === bucket);
  const search = useRowSearch(rows, (a) => [a.client_name, a.policy_no, a.insurer_name, a.class_of_business]);
  const metrics: Metric[] = data
    ? [
        { key: "overdue", label: "Overdue", value: data.counts.overdue, tone: data.counts.overdue ? "crit" : "neutral", note: fmtMoneyShort(data.premium.overdue) },
        { key: "urgent", label: `Due soon (≤${data.urgentDays}d)`, value: data.counts.urgent, tone: data.counts.urgent ? "warn" : "neutral", note: fmtMoneyShort(data.premium.urgent) },
        { key: "upcoming", label: "Upcoming", value: data.counts.upcoming, note: fmtMoneyShort(data.premium.upcoming) },
        { key: "total", label: "Total in window", value: data.counts.total, note: fmtMoneyShort(data.premium.total) },
      ]
    : [];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Pipeline</span>
          <h1>Renewals</h1>
        </div>
        {data && (
          <div className="exec-meta">
            <span>
              {data.lookbackDays} days back · {data.lookaheadDays} days ahead
            </span>
          </div>
        )}
      </header>

      {data && <MetricStrip metrics={metrics} label="Renewal summary" />}

      <form className="exec-filters" onSubmit={(e) => e.preventDefault()} aria-label="Renewal filters">
        <label className="exec-filter">
          <span>Alert</span>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="">All</option>
            <option value="overdue">Overdue</option>
            <option value="urgent">Due soon</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </label>
        {bucket && (
          <button type="button" className="exec-filter-clear" onClick={() => setBucket("")}>
            Clear filter
          </button>
        )}
      </form>

      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Client, policy no, insurer or class…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(a) => a.id}
        onRowClick={setSelected}
        isRowSelected={(a) => a.id === selected?.id}
        emptyMessage="No policies expiring in this window."
      />

      <SideDrawer
        open={selected !== null}
        onClose={closeDrawer}
        title="Renewal email draft"
        subtitle={selected ? `${selected.client_name} · expires ${selected.end_date}` : undefined}
        footer={
          selected && (
            <Link className="btn btn-sm" to={`/transactions/${selected.id}`}>
              Open policy
            </Link>
          )
        }
      >
        {selected && <RenewalDrawerBody id={selected.id} />}
      </SideDrawer>
    </div>
  );
}

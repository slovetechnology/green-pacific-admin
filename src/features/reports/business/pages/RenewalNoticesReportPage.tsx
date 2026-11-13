import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { EmailDocumentForm } from "@/shared/components/EmailDocumentForm";
import { RoleGate } from "@/app/guards/RoleGate";
import { ReportSearch } from "../components/ReportSearch";

interface Policy {
  policy_no: string; class_of_business: string; end_date: string; sum_insured: number;
  premium_due: number; insurer_name: string;
}
interface ClientGroup {
  client_id: number; client_name: string; client_ref: string | null; policies: Policy[];
}
interface Response {
  clients: ClientGroup[];
  lookbackDays: number;
  lookaheadDays: number;
}

export function RenewalNoticesReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const qs = q ? `?${new URLSearchParams({ q }).toString()}` : "";
  const [emailClientId, setEmailClientId] = useState<number | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "renewal-notices", q],
    queryFn: () => api.get<Response>(`/api/reports/renewal-notices${qs}`),
  });

  const policyColumns: DataGridColumn<Policy>[] = [
    { key: "policy_no", header: "Policy No", render: (p) => p.policy_no },
    { key: "class", header: "Class", render: (p) => p.class_of_business },
    { key: "insurer", header: "Insurer", render: (p) => p.insurer_name },
    { key: "sum_insured", header: "Sum Insured", align: "right", render: (p) => fmtMoney(p.sum_insured) },
    { key: "premium_due", header: "Premium Due", align: "right", render: (p) => fmtMoney(p.premium_due) },
    { key: "expiry", header: "Expiry", render: (p) => p.end_date },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Renewal Notices</h1>
        </div>
        <div className="page-header-actions">
          <a className="btn" href={apiUrl(`/api/reports/renewal-notices/pdf${qs}`)}>
            Download All as PDF
          </a>
        </div>
      </div>
      {data && (
        <p className="page-lede">
          Annual policies expiring within the next {data.lookaheadDays} days (or up to {data.lookbackDays} days overdue).
        </p>
      )}

      <div className="toolbar">
        <ReportSearch
          key={q}
          value={q}
          onSearch={(v) => {
            const next = new URLSearchParams(searchParams);
            if (v) next.set("q", v);
            else next.delete("q");
            setSearchParams(next);
          }}
        />
      </div>

      {sent && <div className="flash">{sent}</div>}
      {isLoading && <p>Loading…</p>}
      {!isLoading && data?.clients.length === 0 && <p className="empty-state">No policies are due for renewal in this window.</p>}

      {data?.clients.map((c) => (
        <div className="card" key={c.client_id}>
          <div className="page-header" style={{ marginBottom: "0.6rem" }}>
            <h2 style={{ margin: 0 }}>
              <Link to={`/clients/${c.client_id}`}>{c.client_name}</Link> {c.client_ref && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({c.client_ref})</span>}
            </h2>
            <div className="page-header-actions">
              <a className="btn-secondary btn btn-sm" href={apiUrl(`/api/clients/${c.client_id}/renewal-notice.pdf`)}>
                Download Notice
              </a>
              <RoleGate need="write">
                <button
                  type="button"
                  className="btn-secondary btn btn-sm"
                  onClick={() => {
                    setSent(null);
                    setEmailClientId(emailClientId === c.client_id ? null : c.client_id);
                  }}
                >
                  Email Notice
                </button>
              </RoleGate>
            </div>
          </div>
          {emailClientId === c.client_id && (
            <EmailDocumentForm
              title={`Email Renewal Notice to ${c.client_name}`}
              documentLabel="renewal notice"
              clientName={c.client_name}
              optionsUrl={`/api/clients/${c.client_id}/renewal-notice/email-options`}
              sendUrl={`/api/clients/${c.client_id}/renewal-notice/email`}
              onSent={(msg) => {
                setSent(msg);
                setEmailClientId(null);
              }}
              onClose={() => setEmailClientId(null)}
            />
          )}
          <DataGrid columns={policyColumns} rows={c.policies} isLoading={false} getRowKey={(p) => p.policy_no} />
        </div>
      ))}
    </div>
  );
}

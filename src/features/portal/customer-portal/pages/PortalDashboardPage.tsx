import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { CoverTimeline } from "../components/CoverTimeline";
import { NpsSurvey } from "../components/NpsSurvey";

interface DashboardResponse {
  nPolicies: number;
  nActive: number;
  nPending: number;
  nExpired: number;
  outstanding: number;
  nClaimsOpen: number;
  nDocuments: number;
  nQuoteRequests: number;
}

interface PolicyTx {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  sum_insured: number;
  end_date: string | null;
}

interface PolicyRow {
  tx: PolicyTx;
  lifecycle: string;
}

export function PortalDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => api.get<DashboardResponse>("/api/portal/dashboard"),
  });
  const { data: policyData } = useQuery({
    queryKey: ["portal", "policies"],
    queryFn: () => api.get<{ policies: PolicyRow[] }>("/api/portal/policies"),
  });

  const timelinePolicies =
    policyData?.policies
      .filter((p) => p.lifecycle !== "Cancelled")
      .map((p) => ({
        id: p.tx.id,
        class: p.tx.class_of_business || "Policy",
        policyNo: p.tx.policy_no || `#${p.tx.id}`,
        sumInsured: p.tx.sum_insured,
        endDate: p.tx.end_date,
        lifecycle: p.lifecycle,
      })) ?? [];

  return (
    <div>
      {isLoading && <p>Loading…</p>}
      {data && (
        <>
          <CoverTimeline policies={timelinePolicies} />
          <NpsSurvey />

          <div className="cp-actions">
            {data.outstanding > 0 && (
              <Link to="/portal/billing" className="cp-action cp-action--urgent">
                <b>You have an outstanding balance</b>
                <span>{fmtMoney(data.outstanding)} due across your policies. Pay online to keep cover in force.</span>
              </Link>
            )}
            {data.nClaimsOpen > 0 && (
              <Link to="/portal/claims" className="cp-action">
                <b>
                  {data.nClaimsOpen} claim{data.nClaimsOpen === 1 ? "" : "s"} in progress
                </b>
                <span>Track assessment stages and add supporting documents as they come in.</span>
              </Link>
            )}
            <Link to="/portal/quotes" className="cp-action">
              <b>Request a quote</b>
              <span>Tell us what you need covered and your broker will respond with options.</span>
            </Link>
            <Link to="/portal/documents" className="cp-action">
              <b>Download your documents</b>
              <span>Certificates, schedules and endorsements — {data.nDocuments} on file.</span>
            </Link>
          </div>

          <div className="cp-panel">
            <div className="cp-panel-h">
              <div>
                <h2>Your account at a glance</h2>
              </div>
            </div>
            <div className="kpi-row" style={{ padding: "16px 20px" }}>
              <Link to="/portal/policies" className="cp-panel kpi-card">
                <div className="kpi-label">Policies</div>
                <div className="kpi-value">{data.nPolicies}</div>
                <span className="kpi-trend">
                  {data.nActive} active · {data.nPending} pending · {data.nExpired} expired
                </span>
              </Link>
              <Link to="/portal/billing" className="cp-panel kpi-card">
                <div className="kpi-label">Outstanding balance</div>
                <div className="kpi-value">{fmtMoney(data.outstanding)}</div>
              </Link>
              <Link to="/portal/claims" className="cp-panel kpi-card">
                <div className="kpi-label">Open claims</div>
                <div className="kpi-value">{data.nClaimsOpen}</div>
              </Link>
              <Link to="/portal/quotes" className="cp-panel kpi-card">
                <div className="kpi-label">Quote requests</div>
                <div className="kpi-value">{data.nQuoteRequests}</div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

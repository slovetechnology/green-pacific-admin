import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, openApiFile } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort, fmtPct } from "@/shared/lib/format";
import { Modal } from "@/shared/components/exec/Modal";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { PRIORITY_CLASS, heldList, type RiskReport } from "../api/types";
import "../risk.css";

// Preview of the Client Portfolio Risk Management Report, with the PDF download.
// Policy rows in the preview; the full list is on the tab and the PDF prints the largest 60.
const PREVIEW_POLICIES = 30;

function ReportBody({ report }: { report: RiskReport }) {
  const p = report.experience.portfolio;
  const c = report.gaps.compliance;
  const s = report.experience.settings;
  const policies = [...report.experience.policies].sort((a, b) => b.earned_premium - a.earned_premium || b.incurred - a.incurred);
  const otherGaps = [...report.gaps.gaps.commercial, ...report.gaps.gaps.limits, ...report.gaps.gaps.expiring];
  const metrics: Metric[] = [
    { key: "health", label: "Portfolio health score", value: `${report.health.score}/100`, tone: report.health.tone, note: report.health.grade },
    { key: "compliance", label: "Statutory compliance", value: c.status, tone: c.tone, note: c.label },
    { key: "lr", label: "Loss ratio", value: fmtPct(p.loss_ratio), tone: p.tone, note: p.tier },
    { key: "earned", label: "Earned premium", value: fmtMoneyShort(p.earned_premium), title: fmtMoney(p.earned_premium) },
    { key: "incurred", label: "Incurred claims", value: fmtMoneyShort(p.incurred), title: fmtMoney(p.incurred), note: `${p.claim_count} claim(s)` },
  ];

  return (
    <article className="risk-report">
      <div className="risk-report-meta">
        {report.client.name}
        {report.client.client_ref ? ` (${report.client.client_ref})` : ""} · {report.periodLabel}
        {report.experience.window.from ? ` (${report.experience.window.from} to ${report.experience.window.to})` : ""} · Prepared{" "}
        {report.generatedAt.slice(0, 10)}
        {report.generatedBy ? ` by ${report.generatedBy}` : ""}
      </div>

      <section>
        <h3>1. Executive summary</h3>
        <MetricStrip metrics={metrics} label="Report summary" />
        <ul className="risk-summary">
          {report.executiveSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>2. Claim experience</h3>
        <div className="exec-table-wrap">
          <table className="exec-table is-static risk-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Class</th>
                <th>Term</th>
                <th className="num">Earned</th>
                <th className="num">Claims</th>
                <th className="num">Incurred</th>
                <th className="num">Loss ratio</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {policies.slice(0, PREVIEW_POLICIES).map((r) => (
                <tr key={r.transaction_id}>
                  <td>{r.policy_no || `#${r.transaction_id}`}</td>
                  <td>{r.class_of_business}</td>
                  <td className="risk-term">
                    {r.start_date} – {r.end_date}
                  </td>
                  <td className="num">{fmtMoney(r.earned_premium)}</td>
                  <td className="num">{r.claim_count}</td>
                  <td className="num">{fmtMoney(r.incurred)}</td>
                  <td className="num">{fmtPct(r.loss_ratio)}</td>
                  <td>
                    <span className={`badge badge-tone-${r.tone}`}>{r.tier}</span>
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <td colSpan={3}>Portfolio (paid {fmtMoney(p.paid)} + outstanding {fmtMoney(p.outstanding)} − recoveries {fmtMoney(p.recoveries)})</td>
                <td className="num">{fmtMoney(p.earned_premium)}</td>
                <td className="num">{p.claim_count}</td>
                <td className="num">{fmtMoney(p.incurred)}</td>
                <td className="num">{fmtPct(p.loss_ratio)}</td>
                <td>
                  <span className={`badge badge-tone-${p.tone}`}>{p.tier}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {policies.length > PREVIEW_POLICIES && (
          <p className="risk-note">
            The {PREVIEW_POLICIES} largest of {policies.length} policies by earned premium. The Risk & Analytics tab lists them all.
          </p>
        )}
      </section>

      <section>
        <h3>3. Underwriting & brokerage profitability</h3>
        <div className="exec-grid exec-grid-2">
          <dl className="exec-fields">
            <div className="exec-field"><dt>Earned premium</dt><dd>{fmtMoney(p.earned_premium)}</dd></div>
            <div className="exec-field"><dt>less Incurred claims</dt><dd>{fmtMoney(p.incurred)}</dd></div>
            <div className="exec-field"><dt>less Direct expenses (commission + other)</dt><dd>{fmtMoney(p.direct_expenses)}</dd></div>
            <div className="exec-field"><dt><b>Underwriting profit / (loss)</b></dt><dd><b>{fmtMoney(p.underwriting_profit)}</b></dd></div>
          </dl>
          <dl className="exec-fields">
            <div className="exec-field"><dt>Commission earned</dt><dd>{fmtMoney(p.commission_earned)}</dd></div>
            <div className="exec-field"><dt>plus Fees</dt><dd>{fmtMoney(p.fees)}</dd></div>
            <div className="exec-field">
              <dt>less Servicing & claims handling ({s.servicing_cost_pct}% + {fmtMoney(s.claim_handling_cost)} per claim)</dt>
              <dd>{fmtMoney(p.servicing_cost)}</dd>
            </div>
            <div className="exec-field"><dt><b>Brokerage net profitability</b></dt><dd><b>{fmtMoney(p.brokerage_net)}</b></dd></div>
          </dl>
        </div>
      </section>

      <section>
        <h3>4. Statutory compliance audit</h3>
        <p>
          <span className={`badge badge-tone-${c.tone}`}>{c.status}</span> {c.label}
        </p>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Compulsory insurance</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Evidence / rationale</th>
              </tr>
            </thead>
            <tbody>
              {c.rules.map((r) => (
                <tr key={r.rule_code}>
                  <td>{r.policy_class}</td>
                  <td>{r.regulatory_reference}</td>
                  <td>
                    <span className={`badge badge-${r.status.toLowerCase().replace(/\s+/g, "-")}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.status === "Compliant"
                      ? r.exempt
                        ? "Exempt (recorded on the risk profile)."
                        : `In force: ${heldList(r.held_policies)}`
                      : r.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="risk-note">Statutory references are given for guidance; confirm them against current legislation and NAICOM guidelines.</p>
        <h3 style={{ marginTop: "0.8rem" }}>Commercial coverage gaps, limits & renewals</h3>
        {otherGaps.length === 0 ? (
          <p className="risk-note">None outstanding.</p>
        ) : (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Type</th>
                  <th>Cover</th>
                  <th>Rationale</th>
                  <th>Suggested scope</th>
                </tr>
              </thead>
              <tbody>
                {otherGaps.map((g, i) => (
                  <tr key={`${g.rule_code}-${g.transaction_id}-${i}`}>
                    <td>
                      <span className={`badge ${PRIORITY_CLASS[g.priority]}`}>{g.priority}</span>
                    </td>
                    <td>{g.gap_type}</td>
                    <td>{g.policy_class}</td>
                    <td>{g.rationale}</td>
                    <td>
                      {g.suggested_coverage_scope}
                      {g.estimated_minimum_sum_insured ? ` Minimum about ${fmtMoney(g.estimated_minimum_sum_insured)}.` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3>5. Risk mitigation recommendations</h3>
        {report.recommendations.length === 0 ? (
          <p className="risk-note">No actions required at this time.</p>
        ) : (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Area</th>
                  <th>Action</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {report.recommendations.map((r, i) => (
                  <tr key={`${r.area}-${i}`}>
                    <td>
                      <span className={`badge ${PRIORITY_CLASS[r.priority]}`}>{r.priority}</span>
                    </td>
                    <td>{r.area}</td>
                    <td>{r.action}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  );
}

export function RiskReportModal({ open, onClose, clientId, period }: { open: boolean; onClose: () => void; clientId: string; period: string }) {
  const [error, setError] = useState<string | null>(null);
  const path = `/api/clients/${clientId}/reports/risk-management?period=${encodeURIComponent(period)}`;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["risk-analytics", clientId, "report", period],
    queryFn: () => api.get<RiskReport>(path),
    enabled: open,
  });

  async function download(newTab: boolean) {
    setError(null);
    try {
      await openApiFile(`${path}&format=pdf`, { newTab });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The PDF could not be created.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Client Portfolio Risk Management Report"
      footer={
        <>
          {error && <span className="exec-state is-crit">{error}</span>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(true)} disabled={!data}>
            Open PDF
          </button>
          <button type="button" className="btn btn-sm" onClick={() => download(false)} disabled={!data}>
            Download PDF
          </button>
        </>
      }
    >
      {isLoading && <p className="exec-state">Preparing the report…</p>}
      {isError && <p className="exec-state is-crit">Could not prepare the report.</p>}
      {data && <ReportBody report={data} />}
    </Modal>
  );
}

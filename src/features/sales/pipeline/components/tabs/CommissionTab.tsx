import { Link } from "react-router";
import { Panel } from "@/shared/components/exec/Panel";
import { fmtMoney } from "@/shared/lib/format";
import { toPercent } from "../../lib/types";
import type { TabProps } from "./shared";

// What the deal is expected to earn, and, once it is won, what the policy actually
// booked. The estimate is premium × rate; the actual is the policy's own figures.
export function CommissionTab({ detail }: TabProps) {
  const { deal, policy, subBroker } = detail;
  const expected = (deal.estimated_premium || 0) * (deal.estimated_commission_rate || 0);
  const subShare = deal.sub_broker_id && deal.sub_broker_split_bps !== null ? (expected * deal.sub_broker_split_bps) / 10000 : null;
  return (
    <div role="tabpanel" id="deal-panel-commission" aria-labelledby="deal-tab-commission" tabIndex={0} className="exec-tabpanel">
      <Panel eyebrow="Estimate" title="Expected brokerage">
        <dl className="detail-grid" style={{ marginBottom: 0 }}>
          <div><dt className="k">Estimated premium</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(deal.estimated_premium)}</dd></div>
          <div><dt className="k">Commission rate</dt><dd className="v" style={{ margin: 0 }}>{toPercent(deal.estimated_commission_rate)}%</dd></div>
          <div><dt className="k">Brokerage if won</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(expected)}</dd></div>
          <div><dt className="k">Weighted at {Math.round(deal.probability)}%</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(detail.weightedValue)}</dd></div>
          <div><dt className="k">Owner's share of the credit</dt><dd className="v" style={{ margin: 0 }}>{deal.commission_split_producer}%</dd></div>
          <div><dt className="k">Owner</dt><dd className="v" style={{ margin: 0 }}>{deal.owner_name || "Unassigned"}{deal.producer_name ? ` (${deal.producer_name})` : ""}</dd></div>
        </dl>
        <p className="pl-hint">The credit share is how much of the deal counts toward the owner's figures. It does not pay anyone: producer payouts come from the policy's own commission records.</p>
      </Panel>

      {subBroker && (
        <Panel eyebrow="Shared with" title="Sub-broker">
          <p style={{ margin: 0 }}>
            <Link to={`/sub-brokers/${subBroker.id}`}>{subBroker.name}</Link> ({subBroker.reference_no}) introduced this deal.
            {subShare !== null && <> Agreed share {(deal.sub_broker_split_bps ?? 0) / 100}%: about {fmtMoney(subShare)} of the brokerage before their deductions.</>}
          </p>
          <p className="pl-hint">The actual share is fixed from their rate card when the policy is created, and posted to their commission ledger by the sub-broker module.</p>
        </Panel>
      )}

      <Panel eyebrow="Booked" title="Policy">
        {policy ? (
          <dl className="detail-grid" style={{ marginBottom: 0 }}>
            <div><dt className="k">Policy</dt><dd className="v" style={{ margin: 0 }}><Link to={`/transactions/${policy.id}`}>{policy.policy_no || `#${policy.id}`}</Link></dd></div>
            <div><dt className="k">Insurer</dt><dd className="v" style={{ margin: 0 }}>{policy.insurer_name}</dd></div>
            <div><dt className="k">Debit note</dt><dd className="v" style={{ margin: 0 }}>{policy.debit_note_no || "—"}</dd></div>
            <div><dt className="k">Premium</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(policy.premium_due)}</dd></div>
            <div><dt className="k">Total brokerage</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(policy.total_brokerage)}</dd></div>
            <div><dt className="k">Earned to date</dt><dd className="v" style={{ margin: 0 }}>{fmtMoney(policy.commission_earned)}</dd></div>
            <div><dt className="k">Payment status</dt><dd className="v" style={{ margin: 0 }}>{policy.status}</dd></div>
            <div><dt className="k">Period</dt><dd className="v" style={{ margin: 0 }}>{policy.start_date} to {policy.end_date}</dd></div>
          </dl>
        ) : (
          <p className="pl-hint" style={{ margin: 0 }}>No policy yet. Winning the deal creates it, with its debit note and commission figures.</p>
        )}
      </Panel>
    </div>
  );
}

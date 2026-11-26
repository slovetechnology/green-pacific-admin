import { Link } from "react-router";
import { fmtMoney } from "@/shared/lib/format";
import { fmtDate } from "./format";
import { coverStatus, StatusPill } from "./StatusPill";

interface PolicyCardTx {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  insurer_name: string;
  sum_insured: number;
  premium_due: number;
  start_date: string | null;
  end_date: string | null;
}

// Set when the policy is co-insured: every insurer's share of the risk. The card is the whole policy (the
// server merges the shares, so its amounts are the full figures).
export type PolicyCoinsurance = { id: number; insurer: string; proportion: number }[] | null;

const pct = (p: number) => `${Number((p * 100).toFixed(4))}%`;

export function PolicyCard({ tx, lifecycle, coinsurance = null }: { tx: PolicyCardTx; lifecycle: string; coinsurance?: PolicyCoinsurance }) {

  const status = coverStatus(lifecycle, tx.end_date);
  const lapsed = status === "lapsed";
  return (
    <article className="cp-cert">
      <div className="cp-cert-status">
        <StatusPill status={status} />
      </div>

      <div className="cp-cert-top">
        <h3>{tx.class_of_business || "Policy"}</h3>
        <div className="cp-ins">
          {coinsurance ? "Co-insured" : tx.insurer_name} · {tx.policy_no || `#${tx.id}`}
        </div>
        {coinsurance && (
          <div className="cp-ins">
            {coinsurance.map((m) => `${m.insurer} (${pct(m.proportion)})`).join(", ")}
          </div>
        )}
      </div>

      <div className="cp-cert-body">
        <div className="cp-fld">
          <div className="cp-k">Sum insured</div>
          <div className="cp-v cp-num">{tx.sum_insured ? fmtMoney(tx.sum_insured) : "Per benefit table"}</div>
        </div>
        <div className="cp-fld">
          <div className="cp-k">Premium</div>
          <div className="cp-v cp-num">{fmtMoney(tx.premium_due)}</div>
        </div>
        <div className="cp-fld">
          <div className="cp-k">{lapsed ? "Expired" : "Expires"}</div>
          <div className="cp-v">{fmtDate(tx.end_date)}</div>
        </div>
        <div className="cp-fld">
          <div className="cp-k">Started</div>
          <div className="cp-v">{fmtDate(tx.start_date)}</div>
        </div>
      </div>

      <div className="cp-cert-foot">
        <Link className="cp-btn cp-btn--ghost cp-btn--sm" to="/portal/documents">
          Documents
        </Link>
        <Link className="cp-btn cp-btn--ghost cp-btn--sm" to="/portal/claims">
          Notify a claim
        </Link>
        <div className="cp-spacer" />
        {status === "expiring" && (
          <Link className="cp-btn cp-btn--pay cp-btn--sm" to="/portal/billing">
            Renew
          </Link>
        )}
        {lapsed && (
          <Link className="cp-btn cp-btn--sm" to={tx.class_of_business ? `/portal/quotes?class=${encodeURIComponent(tx.class_of_business)}` : "/portal/quotes"}>
            Re-open cover
          </Link>
        )}
      </div>
    </article>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "@/shared/api/client";
import { PolicyCard, type PolicyCoinsurance } from "../components/PolicyCard";

interface Tx {
  id: number;
  policy_no: string | null;
  class_of_business: string | null;
  insurer_name: string;
  sum_insured: number;
  premium_due: number;
  balance_os: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

interface Policy {
  tx: Tx;
  lifecycle: string;
  coinsurance?: PolicyCoinsurance;
}

export function PortalPoliciesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "policies"],
    queryFn: () => api.get<{ policies: Policy[] }>("/api/portal/policies"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>My Policies</h1>
        </div>
        <Link to="/portal/quotes" className="cp-btn">Request a quote</Link>
      </div>

      {isLoading && <div className="cp-panel cp-empty">Loading…</div>}

      {!isLoading && data?.policies.length === 0 && (
        <div className="cp-panel cp-empty">
          <b>No policies yet</b>
          <p style={{ margin: "0 auto", maxWidth: "46ch" }}>
            Once your broker places cover on your behalf, it will appear here as a certificate card.
          </p>
        </div>
      )}

      <div className="cp-certs">
        {data?.policies.map(({ tx, lifecycle, coinsurance }) => (
          <PolicyCard key={tx.id} tx={tx} lifecycle={lifecycle} coinsurance={coinsurance ?? null} />
        ))}
      </div>
    </div>
  );
}

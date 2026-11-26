import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// "Renews which policy?" on a new Renewal transaction (policy and term records, backend policyTerms.js). The server
// requires an answer for a Renewal: the expiring policy, or "Not on file" when it renews a policy we don't hold. The
// best fit (same client and policy number, or class when there is none, expiring near the start date) is pre-picked.

interface Candidate { id: number; policy_no: string | null; class_of_business: string | null; insurer_name: string | null; start_date: string | null; end_date: string | null; fits: boolean }

export function RenewsPolicyField(props: {
  clientName: string;
  policyNo: string;
  classOfBusiness: string;
  insurerName: string;
  startDate: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { clientName, policyNo, classOfBusiness, insurerName, startDate, value, onChange } = props;
  const ready = Boolean(clientName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate));
  const params = new URLSearchParams({ client_name: clientName.trim(), policy_no: policyNo.trim(), class_of_business: classOfBusiness, insurer_name: insurerName.trim(), start_date: startDate });
  const query = useQuery({
    queryKey: ["transactions", "renewal-candidates", params.toString()],
    enabled: ready,
    queryFn: () => api.get<{ candidates: Candidate[]; suggested: number | null }>(`/api/transactions/meta/renewal-candidates?${params}`),
  });
  const candidates = query.data?.candidates ?? [];
  const suggested = query.data?.suggested ?? null;

  // Pre-pick the best fit until the person chooses something themselves.
  useEffect(() => {
    if (!value && suggested) onChange(String(suggested));
  }, [suggested, value, onChange]);

  const label = (c: Candidate) =>
    `${c.policy_no || `#${c.id}`} · ${c.class_of_business || "—"} · ${c.insurer_name || "—"} · ${c.start_date || "?"} to ${c.end_date || "?"}`;

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label htmlFor="renews_transaction_id">Renews which policy?</label>
      <select id="renews_transaction_id" value={value} onChange={(e) => onChange(e.target.value)} disabled={!ready}>
        <option value="">{ready ? "— Choose the expiring policy —" : "Enter the client and start date first"}</option>
        {candidates.filter((c) => c.fits).length > 0 && (
          <optgroup label="Expiring policies that match">
            {candidates.filter((c) => c.fits).map((c) => <option key={c.id} value={c.id}>{label(c)}{c.id === suggested ? " (suggested)" : ""}</option>)}
          </optgroup>
        )}
        {candidates.filter((c) => !c.fits).length > 0 && (
          <optgroup label="This client's other recent policies">
            {candidates.filter((c) => !c.fits).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
          </optgroup>
        )}
        <option value="none">Not on file (it renews a policy we don't hold)</option>
      </select>
      <p className="text-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
        Renewal reports and the renewal reminders use this link.{ready && !query.isLoading && candidates.length === 0 ? " No earlier policy for this client fits." : ""}
      </p>
    </div>
  );
}

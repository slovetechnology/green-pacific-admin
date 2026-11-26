import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";

// Underwriting > Renewal links to check (backend policyTerms.js). Policies whose renewal link the system could not
// settle on its own: several earlier policies fitted, or a Renewal had none. The best guess is kept (and counted in
// renewal figures) until someone confirms it or picks another.

interface Candidate { id: number; policy_no: string | null; class_of_business: string | null; insurer_name: string | null; start_date: string | null; end_date: string | null; fits: boolean }
interface Row {
  transaction_id: number; client_name: string | null; insurer_name: string | null; policy_no: string | null; class_of_business: string | null;
  business_type: string | null; start_date: string | null; end_date: string | null; status: string;
  renews_transaction_id: number | null; renews_policy_no: string | null; reason: string; candidates: Candidate[];
}

export function RenewalLinksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["transactions", "renewal-links-to-check"], queryFn: () => api.get<{ links: Row[]; count: number }>("/api/transactions/meta/renewal-links-to-check") });
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => api.put(`/api/transactions/${id}/renewal-link`, { renews_transaction_id: value === "none" ? null : Number(value) }),
    onSuccess: (_r, v) => { setDone(`Saved the link for transaction ${v.id}.`); void queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
  });
  const rows = query.data?.links ?? [];
  const choiceFor = (r: Row) => choices[r.transaction_id] ?? (r.renews_transaction_id ? String(r.renews_transaction_id) : "none");

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Underwriting</p>
          <h1>Renewal links to check</h1>
          <p className="text-muted">
            Each policy records which earlier policy it renews. These are the ones the system could not settle: confirm the
            suggested policy or pick another. Renewal rates and reminders read these links.
          </p>
        </div>
      </div>
      {done && <div className="flash flash-success">{done}</div>}
      {save.isError && <div className="flash flash-error">{(save.error as Error).message}</div>}
      <div className="card">
        <p className="text-muted" style={{ marginTop: 0 }}>{query.data ? `${query.data.count} to check${query.data.count > rows.length ? ` (showing the first ${rows.length})` : ""}.` : ""}</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Policy</th><th>Client</th><th>Period</th><th>Why</th><th>Renews</th>{user?.canWrite && <th></th>}</tr></thead>
            <tbody>
              {query.isLoading && <tr><td colSpan={6}>Loading…</td></tr>}
              {!query.isLoading && rows.length === 0 && <tr><td colSpan={6}>Nothing to check: every policy's renewal link is settled.</td></tr>}
              {rows.map((r) => (
                <tr key={r.transaction_id}>
                  <td>
                    <Link to={`/transactions/${r.transaction_id}?tab=history`}>{r.policy_no || `#${r.transaction_id}`}</Link>
                    <div className="text-muted" style={{ fontSize: "0.8rem" }}>{[r.class_of_business, r.insurer_name, r.business_type].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{r.client_name || "—"}</td>
                  <td>{r.start_date} to {r.end_date}</td>
                  <td>{r.reason}</td>
                  <td>
                    {user?.canWrite ? (
                      <select aria-label={`What ${r.policy_no || r.transaction_id} renews`} value={choiceFor(r)} onChange={(e) => setChoices({ ...choices, [r.transaction_id]: e.target.value })}>
                        {r.candidates.map((c) => (
                          <option key={c.id} value={c.id}>{c.policy_no || `#${c.id}`} · {c.insurer_name || "—"} · ends {c.end_date}{c.id === r.renews_transaction_id ? " (current guess)" : ""}{c.fits ? "" : " (number or dates differ)"}</option>
                        ))}
                        <option value="none">Nothing on file</option>
                      </select>
                    ) : (r.renews_policy_no || (r.renews_transaction_id ? `#${r.renews_transaction_id}` : "Nothing on file"))}
                  </td>
                  {user?.canWrite && (
                    <td><button type="button" className="btn btn-sm" disabled={save.isPending} onClick={() => save.mutate({ id: r.transaction_id, value: choiceFor(r) })}>Confirm</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

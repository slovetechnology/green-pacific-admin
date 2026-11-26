import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { parseSplitPercent, pct, useSubBrokerMeta, type SubBroker, type SubBrokerSplit } from "../lib/subBrokers";

// Version history of the agreed splits, plus propose / approve / reject.
// Nothing here edits a rate: a change is a new Pending version that a
// different admin approves, and approval closes the previous one the day
// before (backend lib/subBrokers.js).
export function SplitsTab({ subBroker }: { subBroker: SubBroker }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { meta, can } = useSubBrokerMeta();
  const [cls, setCls] = useState("");
  const [percent, setPercent] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const splits = useQuery({
    queryKey: ["sub-brokers", subBroker.id, "splits"],
    queryFn: () => api.get<{ splits: SubBrokerSplit[] }>(`/api/sub-brokers/${subBroker.id}/splits`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sub-brokers"] });

  const propose = useMutation({
    mutationFn: () => api.post(`/api/sub-brokers/${subBroker.id}/splits`, { class_of_business: cls || null, percent: parseSplitPercent(percent), effective_from: from, reason }),
    onSuccess: () => { setPercent(""); setReason(""); setError(null); refresh(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not propose the change."),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" }) => api.post(`/api/sub-brokers/splits/${id}/${decision}`),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not record the decision."),
  });

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (parseSplitPercent(percent) === null) return setError("Split must be above 0% and at most 100%, with up to 2 decimals.");
    if (!reason.trim()) return setError("Give a reason for the change.");
    setError(null);
    propose.mutate();
  }

  const rows = splits.data?.splits ?? [];
  const groups = new Map<string, SubBrokerSplit[]>();
  for (const s of rows) groups.set(s.class_of_business || "", [...(groups.get(s.class_of_business || "") ?? []), s]);
  const editable = subBroker.status !== "Terminated";

  return (
    <div role="tabpanel" id="sb-panel-splits" aria-labelledby="sb-tab-splits" tabIndex={0} className="exec-tabpanel">
      {error && <div className="flash flash-error">{error}</div>}
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, versions]) => (
        <div className="card" key={name || "default"}>
          <h2>{name || "Default rate (all other classes)"}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Rate</th><th>Effective from</th><th>Effective to</th><th>Status</th><th>Proposed by</th><th>Approved by</th><th>Reason</th><th /></tr>
              </thead>
              <tbody>
                {versions.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{pct(s.rate_bps)}</strong></td>
                    <td>{s.effective_from}</td>
                    <td>{s.effective_to || (s.status === "Approved" ? "current" : "—")}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.created_by}</td>
                    <td>{s.approved_by || "—"}</td>
                    <td>{s.is_initial ? "Agreed at onboarding" : s.reason || "—"}</td>
                    <td>
                      {s.status === "Pending" && can("subbroker.approve-split") && (
                        s.created_by === user?.username ? (
                          <span className="muted">Needs another admin</span>
                        ) : (
                          <>
                            <button type="button" className="btn btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: "approve" })}>Approve</button>{" "}
                            <button type="button" className="btn-secondary btn btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: "reject" })}>Reject</button>
                          </>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {can("subbroker.edit") && editable && (
        <div className="card">
          <h2>Propose a change</h2>
          <p className="muted">Business already placed keeps the rate in force when it was placed. The new rate applies from its effective date once a different admin approves it.</p>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="sp-class">Applies to</label>
                <select id="sp-class" value={cls} onChange={(e) => setCls(e.target.value)}>
                  <option value="">Default rate (all other classes)</option>
                  {(meta?.classes ?? []).map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sp-pct">New split (%)</label>
                <input id="sp-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sp-from">Effective from</label>
                <input id="sp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field span-3">
                <label htmlFor="sp-reason">Reason</label>
                <input id="sp-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={propose.isPending}>Submit for approval</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

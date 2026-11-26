import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { fmtMoney } from "@/shared/lib/format";
import { useSubBrokerMeta, type SubBroker } from "../lib/subBrokers";

interface TxInfo {
  isNote: boolean;
  attached: { id: number; reference: string; name: string; status: string; splitPercent: number; channel: string } | null;
  commissionLines: number;
  suggestions: { source: string; reference: string; subBrokerId: number; subBrokerReference: string; name: string; status: string }[];
}
interface Preview {
  split: { percent: number; source: string };
  otherSplitPercent: number;
  combinedPercent: number;
  withinCap: boolean;
  basis: string;
  totalBrokerage: number;
  placementDate: string;
  accruesNow: null | {
    brokerage: number; grossShare: number; vat: number; vatRate: number; naicomLevy: number; naicomLevyRate: number;
    misc: number; miscRate: number; net: number;
  };
  note: string | null;
}

// The policy's sub-broker: who it is attached to, or attach one with a live
// calculation preview (the split that will be fixed, the deductions, the net).
// Endorsement notes follow their policy's sub-broker, so they only display it.
export function SubBrokerPanel({ txId, isNote }: { txId: string; isNote: boolean }) {
  const queryClient = useQueryClient();
  const { can, meta } = useSubBrokerMeta();
  const [subBrokerId, setSubBrokerId] = useState("");
  const [channel, setChannel] = useState("Received");
  const [error, setError] = useState<string | null>(null);

  const allowed = can("subbroker.view");
  const info = useQuery({
    queryKey: ["sub-brokers", "tx", txId],
    queryFn: () => api.get<TxInfo>(`/api/sub-brokers/transactions/${txId}`),
    enabled: allowed,
  });
  const active = useQuery({
    queryKey: ["sub-brokers", "active-options"],
    queryFn: () => api.get<{ subBrokers: SubBroker[] }>("/api/sub-brokers?status=Active&pageSize=200&sort=name"),
    enabled: allowed && can("subbroker.edit") && !isNote,
  });
  const preview = useQuery({
    queryKey: ["sub-brokers", "preview", txId, subBrokerId],
    queryFn: () => api.get<{ preview: Preview }>(`/api/sub-brokers/preview?transaction_id=${txId}&sub_broker_id=${subBrokerId}`),
    enabled: Boolean(subBrokerId),
    retry: false,
  });

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["sub-brokers"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions", txId] }),
  ]);
  const attach = useMutation({
    mutationFn: () => api.post(`/api/sub-brokers/transactions/${txId}/attach`, { sub_broker_id: Number(subBrokerId), channel }),
    onSuccess: async () => { setError(null); setSubBrokerId(""); await refresh(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not attach the sub-broker."),
  });
  const detach = useMutation({
    mutationFn: () => api.delete(`/api/sub-brokers/transactions/${txId}/attach`),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not detach the sub-broker."),
  });

  if (!allowed || !meta || !info.data) return null;
  const { attached, suggestions, commissionLines } = info.data;
  const p = preview.data?.preview;
  const previewError = preview.error instanceof ApiError ? preview.error.message : null;

  return (
    <div className="card">
      <h2>Sub-broker</h2>
      {error && <div className="flash flash-error">{error}</div>}
      {attached ? (
        <>
          <div className="detail-grid">
            <div><div className="k">Sub-broker</div><div className="v"><Link to={`/sub-brokers/${attached.id}`}>{attached.reference} · {attached.name}</Link></div></div>
            <div><div className="k">Business</div><div className="v">{attached.channel === "Placed" ? "Placed through" : "Received through"}</div></div>
            <div><div className="k">Split fixed at placement</div><div className="v">{attached.splitPercent}%</div></div>
            <div><div className="k">Commission lines</div><div className="v">{commissionLines}</div></div>
          </div>
          <p className="muted">The split was fixed when this business was attached; later rate changes don't alter it.</p>
          {can("subbroker.edit") && !isNote && (
            <div className="form-actions">
              <button type="button" className="btn-secondary btn btn-sm" disabled={detach.isPending}
                onClick={() => { if (window.confirm("Detach this sub-broker? Any commission already posted is reversed. This isn't possible once commission has been paid.")) detach.mutate(); }}>
                Detach sub-broker
              </button>
            </div>
          )}
        </>
      ) : isNote ? (
        <p className="muted">Endorsement notes follow the sub-broker on the policy they amend.</p>
      ) : !can("subbroker.edit") ? (
        <p className="muted">No sub-broker is attached to this policy.</p>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="flash flash-info">
              Noted on {suggestions.map((s) => `${s.source} ${s.reference}`).join(", ")}:{" "}
              {suggestions.map((s) => (
                <button key={`${s.source}-${s.subBrokerId}`} type="button" className="btn-secondary btn btn-sm" style={{ marginLeft: "0.4rem" }} onClick={() => setSubBrokerId(String(s.subBrokerId))}>
                  Use {s.subBrokerReference} {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="sbp-sb">Sub-broker</label>
              <select id="sbp-sb" value={subBrokerId} onChange={(e) => setSubBrokerId(e.target.value)}>
                <option value="">None</option>
                {(active.data?.subBrokers ?? []).map((s) => <option key={s.id} value={s.id}>{s.reference_no} · {s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sbp-ch">Business was</label>
              <select id="sbp-ch" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {(meta.channels ?? ["Received", "Placed"]).map((c) => <option key={c} value={c}>{c} through the sub-broker</option>)}
              </select>
            </div>
          </div>
          {subBrokerId && previewError && <div className="flash flash-error">{previewError}</div>}
          {p && (
            <div className="card" style={{ background: "var(--surface-2)" }}>
              <h3>Calculation preview</h3>
              <div className="detail-grid">
                <div><div className="k">Split ({p.split.source === "class" ? "class rate" : "default rate"})</div><div className="v">{p.split.percent}%</div></div>
                <div><div className="k">Total brokerage</div><div className="v">{fmtMoney(p.totalBrokerage)}</div></div>
                <div><div className="k">Other splits on policy</div><div className="v">{p.otherSplitPercent}%</div></div>
                <div><div className="k">Combined</div><div className="v" style={p.withinCap ? undefined : { color: "var(--status-critical)" }}>{p.combinedPercent}% {p.withinCap ? "" : "(over 100%)"}</div></div>
              </div>
              {p.accruesNow ? (
                <div className="detail-grid" style={{ marginTop: "0.75rem" }}>
                  <div><div className="k">Gross share</div><div className="v">{fmtMoney(p.accruesNow.grossShare)}</div></div>
                  <div><div className="k">VAT ({p.accruesNow.vatRate}%)</div><div className="v">− {fmtMoney(p.accruesNow.vat)}</div></div>
                  <div><div className="k">NAICOM levy ({p.accruesNow.naicomLevyRate}%)</div><div className="v">− {fmtMoney(p.accruesNow.naicomLevy)}</div></div>
                  <div><div className="k">Misc ({p.accruesNow.miscRate}%)</div><div className="v">− {fmtMoney(p.accruesNow.misc)}</div></div>
                  <div><div className="k">Net payable</div><div className="v"><strong>{fmtMoney(p.accruesNow.net)}</strong></div></div>
                </div>
              ) : <p className="muted">{p.note}</p>}
              <p className="muted">Deductions are each a percentage of the gross share. Payable once the premium is paid in full (or as premium is received, per Settings).</p>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="btn" disabled={!subBrokerId || !p || !p.withinCap || attach.isPending} onClick={() => attach.mutate()}>
              {attach.isPending ? "Attaching…" : "Attach sub-broker"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

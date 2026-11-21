import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Modal } from "@/shared/components/exec/Modal";
import { Panel } from "@/shared/components/exec/Panel";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { fmtMoney } from "@/shared/lib/format";
import { POLICY_STATUS_LABELS, QUOTE_STATUS_LABELS } from "@/features/clients/portal/api";
import { GateNotice } from "../GateNotice";
import { MoveDialog, type MoveRequest } from "../MoveDialog";
import { describeError, legalMoves, missingOf, moveKind, tabForWhere, toFraction, toPercent, type GateItem, type Stage } from "../../lib/types";
import { isClosed, type TabProps } from "./shared";
import { promptDialog } from "@/shared/components/Dialogs";

interface KycOptions {
  kyc: { id: number; status: string } | null;
  unlinked: { id: number; reference_no: string; surname: string; first_name: string; customer_type: string | null; status: string; created_at: string }[];
}

export function OverviewTab({ detail, options, canWrite, isAdmin, refresh, onWin, goTo, focus }: TabProps) {
  const { deal } = detail;
  const closed = isClosed(detail);
  const [editing, setEditing] = useState(false);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [blocked, setBlocked] = useState<{ to: string; message: string; items: GateItem[] } | null>(null);
  const [linkingKyc, setLinkingKyc] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dealRef = useRef<HTMLDivElement>(null);
  const gatesRef = useRef<HTMLDivElement>(null);
  const kycRef = useRef<HTMLDivElement>(null);

  // The "Next" card's "Take me there": open or scroll to whatever fixes the missing item.
  useEffect(() => {
    if (!focus) return;
    let el: HTMLDivElement | null = gatesRef.current;
    if (focus.code === "kyc_linked") {
      el = kycRef.current;
      if (canWrite) setLinkingKyc(true);
    } else if (focus.code === "kyc_verified") {
      el = kycRef.current;
    } else if (["expected_close", "parent_policy", "owner", "deal_type", "class", "sub_broker", "campaign"].includes(focus.code)) {
      el = dealRef.current;
      if (canWrite && !closed) setEditing(true);
    }
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  async function doMove(to: Stage) {
    setBlocked(null);
    setError(null);
    const kind = moveKind(deal.stage, to);
    if (!kind) return;
    if (to === "Won") return onWin();
    if (kind !== "forward") return setMove({ deal, to, kind });
    try {
      await api.post(`/api/deals/${deal.id}/transition`, { to_stage: to });
      await refresh();
    } catch (err) {
      setBlocked({ to, message: describeError(err), items: missingOf(err) });
    }
  }

  async function archive() {
    const reason = await promptDialog({ message: "Why are you archiving this deal? (It is hidden, not deleted, and keeps its history.)", required: true, multiline: true });
    if (!reason?.trim()) return;
    try {
      await api.post(`/api/deals/${deal.id}/archive`, { reason });
      await refresh();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const moves = legalMoves(deal.stage);
  return (
    <div role="tabpanel" id="deal-panel-overview" aria-labelledby="deal-tab-overview" tabIndex={0} className="exec-tabpanel">
      {error && <div className="flash flash-error">{error}</div>}
      {deal.archived_at && <div className="pl-notice">This deal was archived on {deal.archived_at.slice(0, 10)}. It no longer appears on the board.</div>}

      <div ref={dealRef}>
      <Panel
        title="Deal"
        actions={canWrite && !closed && !editing ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>Edit</button> : undefined}
      >
        {editing && options ? (
          <EditForm detail={detail} options={options} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await refresh(); }} />
        ) : (
          <dl className="detail-grid" style={{ marginBottom: 0 }}>
            <Fact k="Client"><Link to={`/clients/${deal.client_id}`}>{deal.client_name}</Link></Fact>
            <Fact k="Class of business">{deal.class_of_business || "—"}</Fact>
            <Fact k="Type">{deal.deal_type}{detail.parentPolicy && <> of <Link to={`/transactions/${detail.parentPolicy.id}`}>{detail.parentPolicy.policy_no || `policy #${detail.parentPolicy.id}`}</Link></>}</Fact>
            <Fact k="Estimated premium">{fmtMoney(deal.estimated_premium)}</Fact>
            <Fact k="Commission rate">{toPercent(deal.estimated_commission_rate)}%</Fact>
            <Fact k="Expected brokerage">{fmtMoney(detail.weightedValue)} <span className="pl-hint">at {Math.round(deal.probability)}%</span></Fact>
            <Fact k="Owner">{deal.owner_name || "Unassigned"}{canWrite && !closed && <> · <button type="button" className="btn-link" onClick={() => setReassigning(true)}>Reassign</button></>}</Fact>
            <Fact k="Source">{deal.source || "—"}{deal.lead_source_detail ? ` — ${deal.lead_source_detail}` : ""}</Fact>
            <Fact k="Sub-broker">{detail.subBroker ? <>{detail.subBroker.name} ({detail.subBroker.reference_no})</> : "—"}</Fact>
            <Fact k="Expected close">{deal.expected_close_date || "—"}</Fact>
            <Fact k="Policy / competitor expiry">{deal.x_date || "—"}</Fact>
            <Fact k="Next action">{deal.next_action || "—"}{deal.next_action_at ? ` (${deal.next_action_at})` : ""}</Fact>
            {deal.stage === "Lost" && <Fact k="Lost because">{deal.lost_reason_code}{deal.lost_reason ? `: ${deal.lost_reason}` : ""}</Fact>}
            {detail.policy && <Fact k="Policy"><Link to={`/transactions/${detail.policy.id}`}>{detail.policy.policy_no || `#${detail.policy.id}`}</Link> · debit note {detail.policy.debit_note_no || "—"}</Fact>}
          </dl>
        )}
      </Panel>
      </div>

      {Object.keys(detail.gates).length > 0 && (
        <div ref={gatesRef}>
        <Panel eyebrow="What's needed" title="Before this deal can move forward">
          {Object.entries(detail.gates).map(([stage, gate]) => (
            <div key={stage} style={{ marginBottom: "0.8rem" }}>
              <p className="exec-sub">To reach {stage}</p>
              {gate && gate.missing.length === 0 && gate.warnings.length === 0 && <p className="pl-hint">Everything is in place.</p>}
              <ul className="pl-checklist">
                {gate?.missing.map((m) => (
                  <li key={m.code}>
                    <span className="pl-tick is-no" aria-hidden="true">✗</span>
                    <span>
                      {m.message}{" "}
                      {m.code === "kyc_linked" ? <button type="button" className="btn-link" onClick={() => setLinkingKyc(true)}>Link a KYC submission</button>
                        : tabForWhere(m.where) !== "overview" ? <button type="button" className="btn-link" onClick={() => goTo(tabForWhere(m.where))}>Go there</button>
                        : null}
                    </span>
                  </li>
                ))}
                {gate?.warnings.map((w) => (
                  <li key={w.code}><span className="pl-tick is-no" aria-hidden="true">!</span><span>{w.message}</span></li>
                ))}
                {gate?.missing.length === 0 && <li><span className="pl-tick is-ok" aria-hidden="true">✓</span><span>All requirements met.</span></li>}
              </ul>
            </div>
          ))}
        </Panel>
        </div>
      )}

      {detail.quoteRequest && (
        <Panel eyebrow="Where this deal came from" title="Quote request">
          <p style={{ margin: 0 }}>
            <Link to={`/quote-requests/${detail.quoteRequest.id}`}>{detail.quoteRequest.reference || `Request #${detail.quoteRequest.id}`}</Link>
            {" · "}{detail.quoteRequest.source === "portal" ? "Customer portal" : detail.quoteRequest.source === "marketplace" ? "Website" : "Staff"}
            {detail.quoteRequest.created_at ? ` · ${detail.quoteRequest.created_at.slice(0, 10)}` : ""}
            {detail.quoteRequest.portal?.product_name ? ` · ${detail.quoteRequest.portal.product_name}` : ""}
          </p>
          {detail.quoteRequest.customer && (
            <p style={{ margin: "0.4rem 0 0" }}>
              Customer: <strong>{detail.quoteRequest.customer.name}</strong>
              {[detail.quoteRequest.customer.email, detail.quoteRequest.customer.phone].filter(Boolean).map((v) => ` · ${v}`).join("")}
            </p>
          )}
          {detail.quoteRequest.portal && (
            <p style={{ margin: "0.4rem 0 0" }}>
              Insurer quote: <strong>{QUOTE_STATUS_LABELS[detail.quoteRequest.portal.quote_status ?? ""] ?? "Not requested"}</strong>
              {detail.quoteRequest.portal.premium ? ` · premium ${fmtMoney(detail.quoteRequest.portal.premium)}` : ""}
              {" · "}Policy: <strong>{detail.quoteRequest.portal.policy_no || (POLICY_STATUS_LABELS[detail.quoteRequest.portal.policy_status ?? ""] ?? "Not issued")}</strong>
              {" · "}<Link to={`/portal/quote-requests/${detail.quoteRequest.portal.id}`}>Open the portal request</Link>
            </p>
          )}
        </Panel>
      )}

      <div ref={kycRef}>
      <Panel eyebrow="Client due diligence" title="KYC">
        {detail.kyc ? (
          <p style={{ margin: 0 }}>
            <StatusBadge status={detail.kyc.status} />{" "}
            <Link to={`/kyc-submissions/${detail.kyc.id}`}>Open the KYC record</Link>
            {detail.kyc.risk_level ? ` · risk ${detail.kyc.risk_level}` : ""}
            {detail.kyc.status !== "Verified" && <span className="pl-hint"> · It must be Verified before this deal can be won.</span>}
          </p>
        ) : (
          <p style={{ margin: 0 }}>No KYC is linked to this client yet. Ask the client to complete the <a href="/kyc" target="_blank" rel="noreferrer">KYC form</a>, then link their submission here.</p>
        )}
        {/* The client's KYC is found from the client itself; linking by hand is only for a client with none (or a rejected one). */}
        {canWrite && (!detail.kyc || detail.kyc.status === "Rejected") && (
          <p style={{ margin: "0.5rem 0 0" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkingKyc(true)}>Link a KYC submission</button>
          </p>
        )}
      </Panel>
      </div>

      {canWrite && !deal.archived_at && (moves.length > 0) && (
        <Panel title="Move this deal">
          <div className="pl-actions">
            {moves.map((to) => (
              <button key={to} type="button" className={to === "Lost" ? "btn btn-outline btn-sm" : "btn btn-sm"} onClick={() => doMove(to)}>
                {moveKind(deal.stage, to) === "back" ? `← Back to ${to}` : to === "Lost" ? "Mark as lost" : to === "Won" ? "Mark as won…" : moveKind(deal.stage, to) === "reopen" ? "Reopen" : `Move to ${to}`}
              </button>
            ))}
            {isAdmin && !closed && <button type="button" className="btn btn-outline btn-sm" onClick={archive}>Archive</button>}
          </div>
          {blocked && <div style={{ marginTop: "0.7rem" }}><GateNotice title={`Can't move to ${blocked.to} yet`} message={blocked.items.length ? undefined : blocked.message} items={blocked.items} dealId={deal.id} onDismiss={() => setBlocked(null)} /></div>}
        </Panel>
      )}

      <MoveDialog request={move} lossReasons={detail.lossReasons} onClose={() => setMove(null)} onDone={async () => { setMove(null); await refresh(); }} />
      <KycLinkDialog open={linkingKyc} dealId={deal.id} onClose={() => setLinkingKyc(false)} onLinked={async () => { setLinkingKyc(false); await refresh(); }} />
      <ReassignDialog open={reassigning} detail={detail} options={options} onClose={() => setReassigning(false)} onDone={async () => { setReassigning(false); await refresh(); }} />
    </div>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="k">{k}</dt>
      <dd className="v" style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

function EditForm({ detail, options, onCancel, onSaved }: { detail: TabProps["detail"]; options: NonNullable<TabProps["options"]>; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { deal } = detail;
  const [f, setF] = useState({
    deal_name: deal.deal_name, class_of_business: deal.class_of_business ?? "", estimated_premium: String(deal.estimated_premium || ""),
    ratePct: String(toPercent(deal.estimated_commission_rate)), split: String(deal.commission_split_producer), source: deal.source ?? "",
    lead_source_detail: deal.lead_source_detail ?? "", expected_close_date: deal.expected_close_date ?? "", x_date: deal.x_date ?? "",
    campaign_id: deal.campaign_id ? String(deal.campaign_id) : "", sub_broker_id: deal.sub_broker_id ? String(deal.sub_broker_id) : "",
    sbPct: deal.sub_broker_split_bps !== null && deal.sub_broker_split_bps !== undefined ? String(deal.sub_broker_split_bps / 100) : "",
    next_action: deal.next_action ?? "", next_action_at: deal.next_action_at ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing: GateItem[] } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/deals/${deal.id}`, {
        deal_name: f.deal_name, class_of_business: f.class_of_business, estimated_premium: f.estimated_premium,
        estimated_commission_rate: toFraction(f.ratePct), commission_split_producer: f.split, source: f.source,
        lead_source_detail: f.lead_source_detail, expected_close_date: f.expected_close_date, x_date: f.x_date,
        campaign_id: f.campaign_id, sub_broker_id: f.sub_broker_id,
        sub_broker_split_bps: f.sbPct === "" ? "" : String(Math.round(Number(f.sbPct) * 100)),
        next_action: f.next_action, next_action_at: f.next_action_at,
      });
      await onSaved();
    } catch (err) {
      setError({ message: describeError(err), missing: missingOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="pl-inline-form">
        <div className="field is-wide"><label htmlFor="ov-name">Deal name</label><input id="ov-name" value={f.deal_name} onChange={set("deal_name")} required /></div>
        <div className="field"><label htmlFor="ov-class">Class of business</label>
          <input id="ov-class" list="ov-classes" value={f.class_of_business} onChange={set("class_of_business")} required />
          <datalist id="ov-classes">{options.classes.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div className="field"><label htmlFor="ov-prem">Estimated premium (₦)</label><input id="ov-prem" type="number" min="0" step="0.01" value={f.estimated_premium} onChange={set("estimated_premium")} /></div>
        <div className="field"><label htmlFor="ov-rate">Commission rate (%)</label><input id="ov-rate" type="number" min="0" max="100" step="0.01" value={f.ratePct} onChange={set("ratePct")} /></div>
        <div className="field"><label htmlFor="ov-split">Producer's share of the credit (%)</label><input id="ov-split" type="number" min="0" max="100" step="0.01" value={f.split} onChange={set("split")} /></div>
        <div className="field"><label htmlFor="ov-source">Source</label>
          <select id="ov-source" value={f.source} onChange={set("source")}><option value="">Not recorded</option>{options.sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="field"><label htmlFor="ov-detail">Source detail</label><input id="ov-detail" value={f.lead_source_detail} onChange={set("lead_source_detail")} /></div>
        {f.source === "Campaign" && (
          <div className="field"><label htmlFor="ov-camp">Campaign</label>
            <select id="ov-camp" value={f.campaign_id} onChange={set("campaign_id")}><option value="">Choose…</option>{options.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        )}
        <div className="field"><label htmlFor="ov-sb">Sub-broker</label>
          <select id="ov-sb" value={f.sub_broker_id} onChange={set("sub_broker_id")}><option value="">None</option>{options.subBrokers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.reference_no})</option>)}</select></div>
        {f.sub_broker_id && (
          <div className="field"><label htmlFor="ov-sbpct">Share agreed with them (%)</label><input id="ov-sbpct" type="number" min="0" max="100" step="0.01" value={f.sbPct} onChange={set("sbPct")} />
            <span className="pl-hint">The rate card decides the actual share when the policy is created.</span></div>
        )}
        <div className="field"><label htmlFor="ov-close">Expected close</label><input id="ov-close" type="date" value={f.expected_close_date} onChange={set("expected_close_date")} /></div>
        <div className="field"><label htmlFor="ov-x">Policy / competitor expiry</label><input id="ov-x" type="date" value={f.x_date} onChange={set("x_date")} /></div>
        <div className="field is-wide"><label htmlFor="ov-next">Next action</label><input id="ov-next" value={f.next_action} onChange={set("next_action")} placeholder="What happens next, and who does it" /></div>
        <div className="field"><label htmlFor="ov-nextat">Next action date</label><input id="ov-nextat" type="date" value={f.next_action_at} onChange={set("next_action_at")} /></div>
      </div>
      {error && <GateNotice message={error.message} items={error.missing} dealId={deal.id} tone="crit" />}
      <div className="pl-actions" style={{ marginTop: "0.6rem" }}>
        <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function KycLinkDialog({ open, dealId, onClose, onLinked }: { open: boolean; dealId: number; onClose: () => void; onLinked: () => Promise<void> }) {
  const { data, isLoading } = useQuery({ queryKey: ["deals", String(dealId), "kyc-options"], queryFn: () => api.get<KycOptions>(`/api/deals/${dealId}/kyc-options`), enabled: open });
  const [error, setError] = useState<string | null>(null);
  async function link(id: number) {
    setError(null);
    try {
      await api.post(`/api/deals/${dealId}/kyc-link`, { kyc_id: id });
      await onLinked();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <Modal open={open} title="Link a KYC submission" onClose={onClose} wide>
      <p className="pl-hint" style={{ margin: 0 }}>Submissions that came in through the public KYC form and belong to no client yet. A submission already linked to a client can't be moved.</p>
      {isLoading && <p>Loading…</p>}
      {data && data.unlinked.length === 0 && <p>No unlinked submissions. If the client hasn't filled in the KYC form yet, send them to <a href="/kyc" target="_blank" rel="noreferrer">the KYC form</a>.</p>}
      {data && data.unlinked.length > 0 && (
        <ul className="pl-matches">
          {data.unlinked.map((k) => (
            <li key={k.id}>
              <span>{k.reference_no} · {k.surname} {k.first_name} <span className="pl-chip">{k.customer_type || "individual"}</span> <StatusBadge status={k.status} /> <span className="pl-hint">{k.created_at.slice(0, 10)}</span></span>
              <button type="button" className="btn btn-sm" onClick={() => link(k.id)}>Link</button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="flash flash-error">{error}</div>}
    </Modal>
  );
}

function ReassignDialog({ open, detail, options, onClose, onDone }: { open: boolean; detail: TabProps["detail"]; options: TabProps["options"]; onClose: () => void; onDone: () => Promise<void> }) {
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/deals/${detail.deal.id}/owner`, { owner_user_id: owner, reason });
      await onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <Modal open={open} title="Reassign this deal" onClose={onClose}>
      <form onSubmit={submit} className="pl-form">
        <div className="field"><label htmlFor="ra-owner">New owner</label>
          <select id="ra-owner" value={owner} onChange={(e) => setOwner(e.target.value)} required>
            <option value="">Choose…</option>
            {options?.owners.filter((o) => o.id !== detail.deal.owner_user_id).map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
          </select></div>
        <div className="field"><label htmlFor="ra-reason">Reason</label><textarea id="ra-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
        {error && <div className="flash flash-error">{error}</div>}
        <div className="pl-modal-foot">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-sm">Reassign</button>
        </div>
      </form>
    </Modal>
  );
}


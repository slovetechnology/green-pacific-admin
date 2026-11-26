// Tab 2: the AI intake lead pipeline. A filterable list of ad leads; a row opens a drawer with the conversation,
// the parsed underwriting JSON, the conversions queued, and "Convert to ERP Client / Quote" (a Lead-stage deal in the
// sales pipeline, pre-filled from the lead; the pipeline's own existing-client check applies).
import { useCallback, useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { RoleGate } from "@/app/guards/RoleGate";
import { ApiError } from "@/shared/api/client";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import { Modal } from "@/shared/components/exec/Modal";
import { STATUS_TONE, api, naira, type AdLead, type LeadDetail } from "../api";

const STATUSES = ["NEW", "QUALIFYING", "QUALIFIED_HOT", "NURTURE", "BOUND", "LOST"] as const;
const LINES = ["MOTOR_3P", "MOTOR_COMP", "HEALTH", "GROUP_LIFE", "FLEET", "FIRE_BURGLARY", "MARINE", "ENGINEERING", "OTHER"];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const human = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function Score({ n }: { n: number }) {
  return <span className={`ge-tag ${n >= 75 ? "is-bad" : n >= 45 ? "is-warn" : "is-muted"}`} title="Lead score (0-100)">{n}</span>;
}

export function LeadsTab() {
  const [params, setParams] = useSearchParams();
  const filters = { status: params.get("status") || "", product_line: params.get("line") || "", channel: params.get("channel") || "", q: params.get("q") || "", page: Number(params.get("page")) || 1 };
  const selected = Number(params.get("lead")) || null;
  const setParam = (k: string, v: string) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); if (k !== "page" && k !== "lead") p.delete("page"); return p; }, { replace: true });
  const qs = new URLSearchParams({ ...(filters.status && { status: filters.status }), ...(filters.product_line && { product_line: filters.product_line }), ...(filters.channel && { channel: filters.channel }), ...(filters.q && { q: filters.q }), page: String(filters.page), pageSize: "25" });
  const list = useQuery({ queryKey: ["ads", "leads", qs.toString()], queryFn: () => api.get<{ total: number; page: number; pageSize: number; leads: AdLead[] }>(`/leads?${qs}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const close = useCallback(() => setParams((p) => { p.delete("lead"); return p; }, { replace: true }), [setParams]);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <div className="ge-filters">
        <input type="search" placeholder="Search ref, name, company, phone…" defaultValue={filters.q} onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim()); }} aria-label="Search leads" />
        <select value={filters.status} onChange={(e) => setParam("status", e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{human(s)}</option>)}</select>
        <select value={filters.product_line} onChange={(e) => setParam("line", e.target.value)} aria-label="Product line"><option value="">All products</option>{LINES.map((s) => <option key={s} value={s}>{human(s)}</option>)}</select>
        <select value={filters.channel} onChange={(e) => setParam("channel", e.target.value)} aria-label="Channel"><option value="">All channels</option><option value="WEB">Web</option><option value="WHATSAPP">WhatsApp</option></select>
      </div>
      {list.error ? <p className="alert alert-danger">{errText(list.error)}</p> : null}
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ref</th><th>Who</th><th>Campaign</th><th>Channel</th><th>Product</th><th>Score</th><th>Status</th><th>Policy expiry</th><th>Reminder</th></tr></thead>
            <tbody>
              {(list.data?.leads || []).map((l) => (
                <tr key={l.id} className="ge-click" tabIndex={0} onClick={() => setParam("lead", String(l.id))} onKeyDown={(e) => { if (e.key === "Enter") setParam("lead", String(l.id)); }}>
                  <td data-label="Ref"><strong>{l.tracking_ref}</strong></td>
                  <td data-label="Who">{l.company_name || l.full_name || "—"}<br /><small className="muted">{l.phone_e164}</small></td>
                  <td data-label="Campaign">{l.utm_campaign || <span className="muted">{l.ad_platform.toLowerCase()}</span>}</td>
                  <td data-label="Channel">{l.channel === "WHATSAPP" ? "WhatsApp" : "Web"}</td>
                  <td data-label="Product">{l.product_label}</td>
                  <td data-label="Score"><Score n={l.lead_score} /></td>
                  <td data-label="Status"><span className={`ge-tag is-${STATUS_TONE[l.qualification_status]}`}>{human(l.qualification_status)}</span></td>
                  <td data-label="Policy expiry">{l.current_policy_expiry || "—"}</td>
                  <td data-label="Reminder">{l.renewal_reminder_stage === "NONE" ? "—" : human(l.renewal_reminder_stage)}</td>
                </tr>
              ))}
              {list.data && !list.data.leads.length ? <tr><td colSpan={9} className="muted">No leads match. Leads arrive from the /quote pages, the web chat and WhatsApp.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {list.data && list.data.total > list.data.pageSize ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => setParam("page", String(filters.page - 1))}>Previous</button>
            <span className="muted small">Page {filters.page} of {pages} · {list.data.total} leads</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={filters.page >= pages} onClick={() => setParam("page", String(filters.page + 1))}>Next</button>
          </div>
        ) : null}
      </section>
      <LeadDrawer id={selected} onClose={close} />
    </>
  );
}

function LeadDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState("");
  const detail = useQuery({ queryKey: ["ads", "lead", id], queryFn: () => api.get<LeadDetail>(`/leads/${id}`), enabled: Boolean(id), refetchInterval: 30_000 });
  const send = useMutation({
    mutationFn: () => api.post(`/leads/${id}/messages`, { message }),
    onSuccess: () => { setMessage(""); void qc.invalidateQueries({ queryKey: ["ads", "lead", id] }); },
  });
  const setStatus = useMutation({
    mutationFn: (s: string) => api.patch(`/leads/${id}`, { qualification_status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ads"] }),
  });
  const d = detail.data;
  const l = d?.lead;
  return (
    <SideDrawer
      open={Boolean(id)}
      title={l ? `${l.tracking_ref} · ${l.company_name || l.full_name || l.phone_e164}` : "Lead"}
      subtitle={l ? `${l.product_label} · score ${l.lead_score} · ${human(l.qualification_status)}` : undefined}
      onClose={onClose}
      footer={l ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {l.deal_id ? <Link className="btn btn-primary" to={`/deals/${l.deal_id}`}>Open deal #{l.deal_id}</Link> : (
            <RoleGate need="write"><button type="button" className="btn btn-primary" onClick={() => setConverting(true)}>Convert to ERP Client / Quote</button></RoleGate>
          )}
          {l.erp_client_id ? <Link className="btn btn-secondary" to={`/clients/${l.erp_client_id}`}>Client</Link> : null}
          {l.erp_policy_id ? <Link className="btn btn-secondary" to={`/transactions/${l.erp_policy_id}`}>Policy</Link> : null}
          <RoleGate need="write">
            {l.qualification_status !== "BOUND" && l.qualification_status !== "LOST" ? (
              <button type="button" className="btn btn-secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate("LOST")}>Mark lost</button>
            ) : null}
          </RoleGate>
        </div>
      ) : null}
    >
      <div className="ge">
        {detail.isLoading ? <p className="muted">Loading…</p> : null}
        {detail.error ? <p className="alert alert-danger">{errText(detail.error)}</p> : null}
        {l && d ? (
          <>
            <section className="ge-section">
              <dl className="ge-facts">
                <dt>Phone</dt><dd><a href={`https://wa.me/${l.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{l.phone_e164}</a></dd>
                <dt>Email</dt><dd>{l.email || "—"}</dd>
                <dt>Details</dt><dd>{l.vehicle_or_asset_details || "—"}</dd>
                <dt>Est. value</dt><dd>{Number(l.estimated_sum_insured) > 0 ? naira(l.estimated_sum_insured) : "—"}</dd>
                <dt>Policy expiry</dt><dd>{l.current_policy_expiry || "—"} {l.renewal_reminder_stage !== "NONE" ? <small className="muted">({human(l.renewal_reminder_stage)})</small> : null}</dd>
                <dt>Source</dt><dd>{l.ad_platform} · {l.utm_source || "—"} / {l.utm_campaign || "—"}{l.gclid ? " · gclid" : ""}{l.fbclid ? " · fbclid" : ""}</dd>
                <dt>Created</dt><dd>{l.created_at}</dd>
              </dl>
            </section>
            <section className="ge-section">
              <h3>Conversation</h3>
              <div className="ge-transcript">
                {d.messages.map((m) => (
                  <p key={m.id} className={`is-${m.sender}`}>{m.message_text}<small>{m.sender === "USER" ? "Prospect" : m.sender === "BOT" ? "Assistant" : "Broker"} · {m.channel === "WHATSAPP" ? "WhatsApp" : "Web"} · {m.created_at}</small></p>
                ))}
                {!d.messages.length ? <p className="muted">No messages yet.</p> : null}
              </div>
              <RoleGate need="write">
                <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={(e: FormEvent) => { e.preventDefault(); if (message.trim()) send.mutate(); }}>
                  <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Reply on WhatsApp as the broker…" aria-label="Broker message" style={{ flex: 1 }} maxLength={2000} />
                  <button type="submit" className="btn btn-secondary" disabled={send.isPending || !message.trim()}>Send</button>
                </form>
                {send.error ? <p className="alert alert-danger">{errText(send.error)}</p> : null}
              </RoleGate>
            </section>
            <section className="ge-section">
              <h3>Parsed underwriting data</h3>
              {d.underwriting ? <pre className="ge-json">{JSON.stringify(d.underwriting, null, 2)}</pre> : <p className="muted">Nothing extracted yet.</p>}
            </section>
            {d.outbox.length ? (
              <section className="ge-section">
                <h3>Conversions</h3>
                <ul>{d.outbox.map((o) => <li key={o.id}>{o.conversion_stage} → {o.platform}: {naira(o.commission_value, 2)} · {o.status}{o.last_error ? ` (${o.last_error})` : ""}</li>)}</ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
      <Modal open={converting} title="Convert to ERP client / quote" onClose={() => setConverting(false)}>
        {converting && d ? <ConvertForm detail={d} onDone={(dealId) => { setConverting(false); void qc.invalidateQueries({ queryKey: ["ads"] }); navigate(`/deals/${dealId}`); }} /> : null}
      </Modal>
    </SideDrawer>
  );
}

interface Candidate { client_id: number; name: string; lifecycle_stage: string | null }

function ConvertForm({ detail, onDone }: { detail: LeadDetail; onDone: (dealId: number) => void }) {
  const l = detail.lead;
  const [name, setName] = useState(l.company_name || l.full_name || "");
  const [cls, setCls] = useState(detail.suggestedClass);
  const [premium, setPremium] = useState("");
  const [clientId, setClientId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { ...(clientId ? { client_id: clientId } : { new_client: { name: name.trim() }, confirm_new: confirmNew }), class_of_business: cls, estimated_premium: premium ? Number(premium) : undefined };
      const r = await api.post<{ dealId: number }>(`/leads/${l.id}/convert`, body);
      onDone(r.dealId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data?.candidates)) {
        setCandidates(err.data.candidates as Candidate[]);
        setError(err.message);
      } else if (err instanceof ApiError && Array.isArray(err.data?.missing)) setError((err.data.missing as { message: string }[]).map((m) => m.message).join(" "));
      else setError(errText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ge-form" onSubmit={submit}>
      <p className="muted small" style={{ margin: 0 }}>Creates a Lead-stage deal in the sales pipeline with this lead's details. The deal's client is linked to the lead, so the policy booked for it later marks the lead Bound and reports the commission to the ad platforms.</p>
      {clientId ? (
        <p>Existing client: <strong>{candidates.find((c) => c.client_id === clientId)?.name}</strong> <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClientId(null)}>Change</button></p>
      ) : (
        <label>Client / prospect name<input type="text" value={name} onChange={(e) => { setName(e.target.value); setCandidates([]); setConfirmNew(false); }} required maxLength={250} /></label>
      )}
      {candidates.length && !clientId ? (
        <div className="alert alert-warning">
          <strong>This looks like a client we already know.</strong>
          <ul>{candidates.slice(0, 6).map((c) => <li key={c.client_id}>{c.name} <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setClientId(c.client_id); setError(null); }}>Use this client</button></li>)}</ul>
          <label style={{ flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} /> It is a new prospect</label>
        </div>
      ) : null}
      <label>Class of business<input type="text" value={cls} onChange={(e) => setCls(e.target.value)} required /></label>
      <label>Estimated premium (₦, optional)<input type="number" min={0} step="any" value={premium} onChange={(e) => setPremium(e.target.value)} /></label>
      {error && !candidates.length ? <p className="alert alert-danger">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy || (candidates.length > 0 && !clientId && !confirmNew)}>{busy ? "Creating…" : "Create deal"}</button>
    </form>
  );
}

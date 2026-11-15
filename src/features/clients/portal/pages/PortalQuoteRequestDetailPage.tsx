import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { RoleGate } from "@/app/guards/RoleGate";
import { Modal } from "@/shared/components/exec/Modal";
import { fmtMoney } from "@/shared/lib/format";
import {
  FOLLOW_UP_REASONS, PAYMENT_STATUS_LABELS, POLICY_STATUS_LABELS, QUOTE_STATUS_LABELS, dateTime, providerName, shortDate,
  type PortalRequestDetail,
} from "../api";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function PortalQuoteRequestDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({ premium: "", insurer_quote_no: "", note: "" });
  const [policyForm, setPolicyForm] = useState({ policy_no: "", start_date: "", end_date: "" });
  const [followUp, setFollowUp] = useState({ note: "", reason: "" });
  const [converting, setConverting] = useState(false);
  const [chooseClient, setChooseClient] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["portal-quote-request", id],
    queryFn: () => api.get<{ data: PortalRequestDetail }>(`/api/customer-quote-requests/${id}`),
    // While the insurer is being asked, check back on its own.
    refetchInterval: (q) => (q.state.data?.data.quote?.status === "requested" || q.state.data?.data.policy?.status === "issuing" ? 5000 : false),
  });

  async function act(key: string, path: string, body: unknown, done?: () => void) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      const res = await api.post<{ message?: string }>(`/api/customer-quote-requests/${id}${path}`, body);
      if (res?.message) setNotice(res.message);
      done?.();
      await queryClient.invalidateQueries({ queryKey: ["portal-quote-request", id] });
      await queryClient.invalidateQueries({ queryKey: ["portal-quote-requests"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // A request with no deal yet (no client when it was submitted): staff confirm it and open the deal from here.
  async function convertToDeal(clientId: number | null) {
    const inboxId = data?.data.sales?.inbox_id;
    if (!inboxId) return;
    setError(null);
    setBusy("convert");
    try {
      const res = await api.post<{ dealId: number }>(`/api/quote-requests/${inboxId}/convert`, clientId ? { client_id: clientId } : {});
      setConverting(false);
      await queryClient.invalidateQueries({ queryKey: ["portal-quote-request", id] });
      navigate(`/deals/${res.dealId}`);
    } catch (err) {
      setConverting(false);
      setChooseClient(Boolean(err instanceof ApiError && Array.isArray(err.data?.candidates) && err.data.candidates.length));
      const missing = (err instanceof ApiError ? (err.data?.missing as { message: string }[] | undefined) : undefined) ?? [];
      setError(err instanceof ApiError ? [err.message, ...missing.map((m) => m.message)].join(" ") : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p>Loading…</p>;
  const r = data?.data;
  if (!r) return <p>Quote request not found.</p>;
  const submitted = r.status === "submitted";
  const unpaid = submitted && !r.policy;

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/portal/quote-requests">Portal Quote Requests</Link> · {r.reference ?? "Draft"}</p>
          <h1>{r.product.name}</h1>
          <p className="page-lede">
            {r.product.provider_name} · {r.customer?.name ?? "—"}
            {r.renewal_of_policy_id ? <> · Renewal of <Link to={`/transactions/${r.renewal_of_policy_id}`}>policy #{r.renewal_of_policy_id}</Link></> : null}
          </p>
        </div>
        <div className="page-header-actions">
          <StatusBadge status={r.status} />
          {r.sales?.deal && <Link className="btn" to={`/deals/${r.sales.deal.id}`}>Open deal</Link>}
        </div>
      </div>

      {error && (
        <div className="flash flash-error">
          {error}
          {chooseClient && r.sales && <> <Link to={`/quote-requests/${r.sales.inbox_id}`}>Choose the client →</Link></>}
        </div>
      )}
      {notice && <div className="flash flash-success">{notice}</div>}

      <div className="card">
        <h2>Customer</h2>
        <div className="detail-grid">
          <Field label="Name" value={r.customer?.name} />
          <Field label="Email" value={r.customer?.email} />
          <Field label="Phone" value={r.customer?.phone} />
          <Field label="Client record" value={r.customer?.client_id ? <Link to={`/clients/${r.customer.client_id}`}>Open client →</Link> : "Not linked yet (linked when the KYC is verified)"} />
          <Field label="Last activity" value={`${dateTime(r.last_activity_at)}${r.idle_days !== null ? ` (${r.idle_days} days ago)` : ""}`} />
          <Field label="Submitted" value={dateTime(r.submitted_at)} />
          {r.status === "abandoned" && <Field label="Why discarded" value={[r.abandon_reason, r.abandon_note].filter(Boolean).join(" — ")} />}
        </div>
      </div>

      {submitted && r.sales && (
        <div className="card">
          <h2>Sales &amp; deal</h2>
          <div className="detail-grid">
            <Field label="Request status" value={<StatusBadge status={r.sales.inbox_status} />} />
            {r.sales.deal ? (
              <>
                <Field label="Deal" value={<Link to={`/deals/${r.sales.deal.id}`}>{r.sales.deal.deal_name} →</Link>} />
                <Field label="Stage" value={<StatusBadge status={r.sales.deal.stage} />} />
                <Field label="Owner" value={r.sales.deal.owner ?? "Not assigned yet (assign on the deal)"} />
                <Field label="Expected close" value={r.sales.deal.expected_close_date} />
                <Field label="Type" value={r.sales.deal.deal_type} />
                {r.sales.deal.next_action && <Field label="Next action" value={`${r.sales.deal.next_action}${r.sales.deal.next_action_at ? ` (${shortDate(r.sales.deal.next_action_at)})` : ""}`} />}
              </>
            ) : (
              <Field label="Deal" value="None yet" />
            )}
            {r.sales.staff_notes && <Field label="Staff notes" value={r.sales.staff_notes} />}
          </div>
          {!r.sales.deal && (
            <>
              <p className="page-lede" style={{ marginTop: "0.75rem" }}>
                {r.customer?.client_id
                  ? "The deal opens by itself once the customer's KYC is verified. You can open it now."
                  : "No deal yet: the customer has no client record (it is linked when their KYC is verified). Converting creates the client from the request's details."}
              </p>
              <RoleGate need="write">
                {r.sales.inbox_status !== "Declined" && (
                  <div className="form-actions">
                    <button type="button" className="btn" disabled={busy !== null} onClick={() => setConverting(true)}>Convert to deal</button>
                  </div>
                )}
              </RoleGate>
            </>
          )}
        </div>
      )}

      <Modal
        open={converting}
        title="Open a deal for this request?"
        onClose={() => setConverting(false)}
        footer={<>
          <button type="button" className="btn-secondary btn" onClick={() => setConverting(false)} disabled={busy === "convert"}>Cancel</button>
          <button type="button" className="btn" onClick={() => convertToDeal(r.customer?.client_id ?? null)} disabled={busy === "convert"}>{busy === "convert" ? "Opening…" : "Confirm and open deal"}</button>
        </>}
      >
        <div className="confirm-summary">
          <div><div className="k">Request</div><div className="v">{r.reference}</div></div>
          <div><div className="k">Customer</div><div className="v">{r.customer?.name ?? "—"}</div></div>
          <div><div className="k">Product</div><div className="v">{r.product.name}</div></div>
        </div>
        <p className="confirm-lede">Check the request is genuine and complete. This:</p>
        <ul className="confirm-steps">
          <li>creates a deal in the Pipeline with these details</li>
          <li>{r.customer?.client_id ? "links it to the customer's client record" : "links it to a matching client, or creates one from the request"}</li>
          <li>marks the request Converted (the customer sees "In review")</li>
        </ul>
      </Modal>

      {submitted && r.quote && (
        <div className="card">
          <h2>Insurer quote</h2>
          <div className="detail-grid">
            <Field label="Status" value={<StatusBadge status={QUOTE_STATUS_LABELS[r.quote.status] ?? r.quote.status} />} />
            <Field label="Premium" value={r.quote.premium ? fmtMoney(r.quote.premium) : null} />
            <Field label="Insurer quote no." value={r.quote.insurer_quote_no} />
            <Field label="Quoted by" value={r.quote.source === "insurer" ? `${providerName(r.product.source)} (online)` : r.quote.source === "staff" ? "Green Pacific staff" : null} />
            <Field label="Quoted at" value={dateTime(r.quote.quoted_at)} />
            <Field label="Note" value={r.quote.staff_note} />
          </div>
          {r.quote.error && <div className="flash flash-warning" style={{ marginTop: "0.75rem" }}>{r.quote.error}</div>}
          <RoleGate need="write">
            {unpaid && (
              <>
                <div className="form-actions">
                  <button type="button" className="btn-secondary btn" disabled={busy !== null} onClick={() => act("ask", "/request-quote", {})}>
                    {busy === "ask" ? "Asking…" : `Ask ${providerName(r.product.source)} again`}
                  </button>
                </div>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    act("quote", "/quote", { premium: Number(quoteForm.premium.replace(/,/g, "")), insurer_quote_no: quoteForm.insurer_quote_no, note: quoteForm.note }, () => setQuoteForm({ premium: "", insurer_quote_no: "", note: "" }));
                  }}
                >
                  <h3>Record the insurer&apos;s quote</h3>
                  <p className="page-lede">When the quote could not be got online, enter the premium the insurer gave you. The customer can then pay it.</p>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="q_premium">Premium (₦)</label>
                      <input id="q_premium" inputMode="decimal" required value={quoteForm.premium} onChange={(e) => setQuoteForm({ ...quoteForm, premium: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="q_no">Insurer quote no.</label>
                      <input id="q_no" value={quoteForm.insurer_quote_no} onChange={(e) => setQuoteForm({ ...quoteForm, insurer_quote_no: e.target.value })} />
                    </div>
                    <div className="field span-2">
                      <label htmlFor="q_note">Note for the customer (optional)</label>
                      <input id="q_note" value={quoteForm.note} onChange={(e) => setQuoteForm({ ...quoteForm, note: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn" disabled={busy !== null}>{busy === "quote" ? "Saving…" : "Save quote"}</button>
                  </div>
                </form>
              </>
            )}
          </RoleGate>
        </div>
      )}

      {submitted && (
        <div className="card">
          <h2>Payments</h2>
          {r.payments.length === 0 ? (
            <p className="page-lede">No payment yet{r.quote?.status === "quoted" ? ": the customer can pay the quote from the portal." : "."}</p>
          ) : (
            <table>
              <thead><tr><th>Reference</th><th>Started</th><th className="num">Amount</th><th>Status</th><th>Reviewed</th><th>Reason</th></tr></thead>
              <tbody>
                {r.payments.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/portal/payments/${p.id}`}>{p.reference}</Link></td>
                    <td>{shortDate(p.created_at)}</td>
                    <td className="num">{fmtMoney(p.amount)}</td>
                    <td><StatusBadge status={PAYMENT_STATUS_LABELS[p.status] ?? p.status} /></td>
                    <td>{p.reviewed_by ? `${p.reviewed_by}, ${dateTime(p.reviewed_at)}` : "—"}</td>
                    <td>{p.rejection_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {r.policy && (
        <div className="card">
          <h2>Policy</h2>
          <div className="detail-grid">
            <Field label="Status" value={<StatusBadge status={POLICY_STATUS_LABELS[r.policy.status] ?? r.policy.status} />} />
            <Field label="Policy no." value={r.policy.policy_no} />
            <Field label="Cover" value={r.policy.start_date ? `${r.policy.start_date} to ${r.policy.end_date ?? "—"}` : null} />
            <Field label="Issued" value={dateTime(r.policy.issued_at)} />
            <Field label="Insurer reference" value={r.policy.insurer_policy_ref} />
            <Field label="Policy in the ERP" value={r.erp_policy ? <Link to={`/transactions/${r.erp_policy.id}`}>{r.erp_policy.policy_no || `#${r.erp_policy.id}`} · {r.erp_policy.status} →</Link> : null} />
            <Field label="Receipt" value={r.policy.receipt_id ? <Link to={`/receipts/${r.policy.receipt_id}`}>Open receipt →</Link> : null} />
          </div>
          {r.policy.error && <div className="flash flash-warning" style={{ marginTop: "0.75rem" }}>{r.policy.error}</div>}
          <RoleGate need="write">
            {r.policy.status !== "issued" && (
              <>
                <div className="form-actions">
                  <button type="button" className="btn-secondary btn" disabled={busy !== null || r.policy.status === "issuing"} onClick={() => act("issue", "/issue-policy", {})}>
                    {busy === "issue" || r.policy.status === "issuing" ? "Issuing…" : "Try issuing again"}
                  </button>
                </div>
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    act("policy", "/policy", policyForm, () => setPolicyForm({ policy_no: "", start_date: "", end_date: "" }));
                  }}
                >
                  <h3>Record the policy number</h3>
                  <p className="page-lede">When you placed the policy with the insurer yourself. The policy in the ERP is updated with it.</p>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="p_no">Policy no.</label>
                      <input id="p_no" required value={policyForm.policy_no} onChange={(e) => setPolicyForm({ ...policyForm, policy_no: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="p_start">Start date (if different)</label>
                      <input id="p_start" type="date" value={policyForm.start_date} onChange={(e) => setPolicyForm({ ...policyForm, start_date: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor="p_end">End date (if different)</label>
                      <input id="p_end" type="date" value={policyForm.end_date} onChange={(e) => setPolicyForm({ ...policyForm, end_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn" disabled={busy !== null}>{busy === "policy" ? "Saving…" : "Save policy number"}</button>
                  </div>
                </form>
              </>
            )}
          </RoleGate>
        </div>
      )}

      {r.status === "draft" && (
        <div className="card">
          <h2>Progress</h2>
          <table>
            <thead><tr><th>Step</th><th>Done</th><th>Still missing</th></tr></thead>
            <tbody>
              {r.progress.map((p) => (
                <tr key={p.key}>
                  <td>{p.title}</td>
                  <td>{p.complete ? "Yes" : "No"}</td>
                  <td>{p.missing.map((m) => m.label).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.answers.map((section) => (
        <div className="card" key={section.title}>
          <h2>{section.title}</h2>
          <div className="detail-grid">
            {section.lines.map((line) => <Field key={line.label} label={line.label} value={line.value} />)}
          </div>
        </div>
      ))}

      <div className="card">
        <h2>Follow-ups</h2>
        {r.follow_ups.length === 0 ? <p className="page-lede">No follow-ups yet.</p> : (
          <ul className="timeline">
            {r.follow_ups.map((f) => (
              <li key={f.id}>
                <strong>{dateTime(f.created_at)}</strong> · {f.created_by}{f.reason ? ` · ${f.reason}` : ""}
                <div>{f.note}</div>
              </li>
            ))}
          </ul>
        )}
        <RoleGate need="write">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              act("follow", "/follow-ups", { note: followUp.note, reason: followUp.reason || undefined }, () => setFollowUp({ note: "", reason: "" }));
            }}
          >
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor="f_note">Note (a call, an email, what was agreed)</label>
                <textarea id="f_note" rows={2} required value={followUp.note} onChange={(e) => setFollowUp({ ...followUp, note: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f_reason">Why the customer stopped (optional)</label>
                <select id="f_reason" value={followUp.reason} onChange={(e) => setFollowUp({ ...followUp, reason: e.target.value })}>
                  <option value="">—</option>
                  {FOLLOW_UP_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy !== null}>{busy === "follow" ? "Saving…" : "Add follow-up"}</button>
            </div>
          </form>
        </RoleGate>
      </div>
    </div>
  );
}

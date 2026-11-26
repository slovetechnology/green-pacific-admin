import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload, ApiError, apiUrl, documentTooLarge } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { SanctionsBadge } from "@/features/compliance/sanctions/components/SanctionsBadge";
import { ClientConsentPanel } from "@/features/compliance/privacy/components/ClientConsentPanel";
import { RoleGate } from "@/app/guards/RoleGate";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { Tabs, type TabDef } from "@/shared/components/exec/Tabs";
import "@/shared/styles/executive.css";
import { ClientCorrespondence } from "@/features/clients/messages/components/ClientCorrespondence";

interface ClaimRow {
  id: number;
  claim_no: string;
  status: string;
  date_reported: string | null;
  claimed_amount: number;
}

interface DealRow {
  id: number;
  deal_name: string;
  stage: string;
  producer_name: string | null;
  estimated_premium: number;
}

interface ContactRow {
  id: number;
  name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone: string | null;
}

interface DocumentRow {
  id: number;
  doc_type: string;
  title: string | null;
  uploaded_at: string;
}

interface CoverageGap {
  class_of_business: string;
  priority: string;
}

interface PortalUser {
  id: number;
  name: string;
  email: string;
  last_login_at: string | null;
}

interface Client {
  id: number;
  name: string;
  client_ref: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  assigned_broker_name: string | null;
  account_type: string | null;
  lifecycle_stage: string | null;
  parent_client_id: number | null;
}

interface TransactionRow {
  id: number;
  trans_date: string | null;
  policy_no: string | null;
  insurer_name: string;
  class_of_business: string | null;
  premium_due: number;
  balance_os: number;
  status: string | null;
}

interface ClientDetailResponse {
  client: Client;
  transactions: TransactionRow[];
  parent: { id: number; name: string } | null;
  subsidiaries: { id: number; name: string; account_type: string | null }[];
  contacts: ContactRow[];
  documents: DocumentRow[];
  deals: DealRow[];
  coverageGaps: CoverageGap[];
  portalUsers: PortalUser[];
  nQuoteRequests: number;
  nMessages: number;
  accountManager: { id: number; username: string } | null;
  branch: { id: number; name: string } | null;
  contactRoleTypes: string[];
  docTypes: string[];
}

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function ClientDetailPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [contactForm, setContactForm] = useState({ name: "", title: "", role_type: "Other", email: "", phone: "" });
  const [docForm, setDocForm] = useState({ doc_type: "", title: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [portalForm, setPortalForm] = useState({ name: "", email: "" });
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => api.get<ClientDetailResponse>(`/api/clients/${clientId}`),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
  }

  const claimsQuery = useQuery({
    queryKey: ["claims", "client", clientId],
    queryFn: () => api.get<{ claims: ClaimRow[] }>(`/api/claims?client_id=${clientId}`),
  });

  async function handleDelete() {
    if (!confirmAction("Delete this client? This cannot be undone.")) return;
    try {
      await api.delete(`/api/clients/${clientId}`);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      navigate("/clients");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete client.");
    }
  }

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Client not found.</p>;
  const { client, transactions, parent, subsidiaries, contacts, documents, deals, coverageGaps, portalUsers, nQuoteRequests, nMessages, accountManager, branch } = data;

  async function handleAddContact(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/clients/${clientId}/contacts`, contactForm);
      setContactForm({ name: "", title: "", role_type: "Other", email: "", phone: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteContact(contactId: number) {
    if (!confirmAction("Remove this contact?")) return;
    await api.delete(`/api/contacts/${contactId}`);
    await refresh();
  }

  async function handleUploadDocument(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!docFile) {
      setError("Choose a file to upload.");
      return;
    }
    if (!docForm.doc_type) {
      setError("Choose a document type.");
      return;
    }
    const tooLarge = documentTooLarge(docFile);
    if (tooLarge) {
      setError(tooLarge);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("doc_type", docForm.doc_type);
      fd.append("title", docForm.title);
      fd.append("file", docFile);
      await apiUpload(`/api/clients/${clientId}/documents`, fd);
      setDocForm({ doc_type: "", title: "" });
      setDocFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDocument(docId: number) {
    if (!confirmAction("Delete this document?")) return;
    await api.delete(`/api/documents/${docId}`);
    await refresh();
  }

  async function handleCreatePortalAccess(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<{ tempPassword: string }>(`/api/clients/${clientId}/portal-access`, portalForm);
      setPortalNotice(
        `Portal access created for ${portalForm.name} (${portalForm.email}). Temporary password: ${result.tempPassword} — share this with the customer; they'll be asked to change it on first login.`
      );
      setPortalForm({ name: "", email: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPortalAccess(cuId: number) {
    if (!confirmAction("Reset this customer's password?")) return;
    const result = await api.post<{ tempPassword: string; email: string }>(
      `/api/clients/${clientId}/portal-access/${cuId}/reset`
    );
    setPortalNotice(`Password reset for ${result.email}. Temporary password: ${result.tempPassword}`);
  }

  async function handleDeletePortalAccess(cuId: number) {
    if (!confirmAction("Remove portal access for this customer?")) return;
    await api.delete(`/api/clients/${clientId}/portal-access/${cuId}`);
    await refresh();
  }

  const CLOSED_CLAIMS = ["Settled", "Closed", "Repudiated", "Rejected", "Declined"];
  const claims = claimsQuery.data?.claims ?? [];
  const openClaims = claims.filter((c) => !CLOSED_CLAIMS.includes(c.status)).length;
  const premium = transactions.reduce((sum, t) => sum + (Number(t.premium_due) || 0), 0);
  const owed = transactions.reduce((sum, t) => sum + Math.max(0, Number(t.balance_os) || 0), 0);

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", count: transactions.length },
    { id: "people", label: "Contacts & documents", count: contacts.length + documents.length },
    { id: "messages", label: "Messages", count: nMessages },
    { id: "portal", label: "Customer portal", count: portalUsers.length },
  ];
  const tab = tabs.some((x) => x.id === searchParams.get("tab")) ? (searchParams.get("tab") as string) : "overview";
  function setTab(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: true });
  }

  const metrics: Metric[] = [
    { key: "policies", label: "Policies", value: transactions.length },
    { key: "premium", label: "Premium due", value: fmtMoneyShort(premium), title: fmtMoney(premium) },
    { key: "owed", label: "Balance O/S", value: fmtMoneyShort(owed), title: fmtMoney(owed), tone: owed > 0 ? "crit" : "good" },
    { key: "claims", label: "Open claims", value: openClaims, tone: openClaims ? "warn" : "neutral", note: `${claims.length} in total` },
    { key: "deals", label: "Deals", value: deals.length },
  ];

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">
            {client.client_ref || "—"} {client.lifecycle_stage && `· ${client.lifecycle_stage}`}
          </span>
          <h1>{client.name}</h1>
        </div>
        <div className="exec-meta">
          <span>{[client.city, client.state].filter(Boolean).join(", ") || "No location"}</span>
          <span>{accountManager?.username ? `Manager: ${accountManager.username}` : "No account manager"}</span>
          <SanctionsBadge type="client" id={Number(clientId)} />
        </div>
        <div className="exec-header-actions">
          <Link className="btn-secondary btn btn-sm" to={`/reports/loss-experience?client_id=${clientId}`}>
            Loss experience
          </Link>
          <RoleGate need="write">
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/clients/${clientId}/edit`)}>
              Edit
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/deals/new?client_id=${clientId}`)}>
              + Deal
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/claims/new?client_id=${clientId}`)}>
              File a claim
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/kyc?client_id=${clientId}`)}>
              Start KYC
            </button>
            <button type="button" className="btn-secondary btn btn-sm" onClick={() => navigate(`/tasks/new?entity_type=client&entity_id=${clientId}`)}>
              + Task
            </button>
            <button type="button" className="btn-danger btn btn-sm" onClick={handleDelete}>
              Delete
            </button>
          </RoleGate>
        </div>
      </header>

      <MetricStrip metrics={metrics} label="Client summary" />

      <section className="exec-workspace" aria-label="Client workspace">
        <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="client" label="Client views" />

      {tab === "overview" && (
      <div role="tabpanel" id="client-panel-overview" aria-labelledby="client-tab-overview" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <h2>Client info</h2>
        <div className="detail-grid">
          <div>
            <div className="k">Address</div>
            <div className="v">{client.address || "—"}</div>
          </div>
          <div>
            <div className="k">City</div>
            <div className="v">{client.city || "—"}</div>
          </div>
          <div>
            <div className="k">State</div>
            <div className="v">{client.state || "—"}</div>
          </div>
          <div>
            <div className="k">Policies</div>
            <div className="v">{transactions.length}</div>
          </div>
          <div>
            <div className="k">Account manager</div>
            <div className="v">{accountManager?.username || "Unassigned"}</div>
          </div>
          <div>
            <div className="k">Branch</div>
            <div className="v">{branch?.name || "—"}</div>
          </div>
          <div>
            <div className="k">Assigned broker</div>
            <div className="v">{client.assigned_broker_name || "—"}</div>
          </div>
          <div>
            <div className="k">Account type</div>
            <div className="v">
              {client.account_type || "Standalone"}
              {parent && (
                <>
                  {" "}
                  · sub of <Link to={`/clients/${parent.id}`}>{parent.name}</Link>
                </>
              )}
            </div>
          </div>
        </div>
        {subsidiaries.length > 0 && (
          <>
            <div className="section-title">Subsidiaries / job sites</div>
            <ul>
              {subsidiaries.map((s) => (
                <li key={s.id}>
                  <Link to={`/clients/${s.id}`}>{s.name}</Link> {s.account_type ? `(${s.account_type})` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {coverageGaps.length > 0 && (
          <>
            <div className="section-title">Coverage gaps</div>
            <div>
              {coverageGaps.map((g) => (
                <span key={g.class_of_business} className={`badge badge-${slug(g.priority)}`} style={{ marginRight: "0.4rem" }}>
                  {g.class_of_business}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Transactions</h2>
          <RoleGate need="write">
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/transactions/new?client_id=${clientId}`)}>
              + New transaction
            </button>
          </RoleGate>
        </div>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Date</th>
                <th>Policy No</th>
                <th>Insurer</th>
                <th>Class</th>
                <th className="num">Premium Due</th>
                <th className="num">Balance O/S</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No transactions yet.
                  </td>
                </tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/transactions/${t.id}`}>{t.trans_date || "—"}</Link>
                  </td>
                  <td>{t.policy_no || "—"}</td>
                  <td>{t.insurer_name}</td>
                  <td>{t.class_of_business || "—"}</td>
                  <td className="num">{fmtMoney(t.premium_due)}</td>
                  <td className="num">{fmtMoney(t.balance_os)}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {claimsQuery.data && claimsQuery.data.claims.length > 0 && (
        <div className="card">
          <h2>Claims</h2>
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Claim No</th>
                  <th>Reported</th>
                  <th className="num">Claimed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claimsQuery.data.claims.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/claims/${c.id}`}>{c.claim_no}</Link>
                    </td>
                    <td>{c.date_reported || "—"}</td>
                    <td className="num">{fmtMoney(c.claimed_amount)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deals.length > 0 && (
        <div className="card">
          <h2>Deals</h2>
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th>Producer</th>
                  <th className="num">Est. Premium</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/deals/${d.id}`}>{d.deal_name}</Link>
                    </td>
                    <td>
                      <StatusBadge status={d.stage} />
                    </td>
                    <td>{d.producer_name || "—"}</td>
                    <td className="num">{fmtMoney(d.estimated_premium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>
      )}

      {tab === "people" && (
      <div role="tabpanel" id="client-panel-people" aria-labelledby="client-tab-people" tabIndex={0} className="exec-tabpanel">
        <ClientConsentPanel clientId={Number(clientId)} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Contacts</h3>
        {contacts.length > 0 && (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <RoleGate need="write"><th></th></RoleGate>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.title || "—"}</td>
                    <td>{c.role_type}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.phone || "—"}</td>
                    <RoleGate need="write">
                      <td>
                        <button type="button" className="btn-danger btn-sm" onClick={() => handleDeleteContact(c.id)}>Remove</button>
                      </td>
                    </RoleGate>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RoleGate need="write">
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleAddContact} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="contact_name">Name</label>
                <input id="contact_name" required value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="contact_title">Title</label>
                <input id="contact_title" value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="contact_role">Role</label>
                <select id="contact_role" value={contactForm.role_type} onChange={(e) => setContactForm({ ...contactForm, role_type: e.target.value })}>
                  {data.contactRoleTypes.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="contact_email">Email</label>
                <input id="contact_email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="contact_phone">Phone</label>
                <input id="contact_phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-secondary btn" disabled={busy}>Add contact</button>
            </div>
          </form>
        </RoleGate>
      </div>

      <div className="card">
        <h2>Documents</h2>
        <div className="exec-table-wrap">
          <table className="exec-table is-static">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No documents uploaded yet.</td>
                </tr>
              )}
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.doc_type}</td>
                  <td>{d.title || d.doc_type}</td>
                  <td>{(d.uploaded_at || "").slice(0, 10)}</td>
                  <td className="actions-row">
                    <a className="btn-secondary btn-sm" href={apiUrl(`/api/documents/${d.id}/file`)}>Download</a>
                    <RoleGate need="write">
                      <button type="button" className="btn-danger btn-sm" onClick={() => handleDeleteDocument(d.id)}>Delete</button>
                    </RoleGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RoleGate need="write">
          <form onSubmit={handleUploadDocument} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="client_doc_type">Type</label>
                <select id="client_doc_type" value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}>
                  <option value="">— Select —</option>
                  {data.docTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <RoleGate need="admin">
                  <small>
                    Type missing? <Link to="/document-types?area=client">Manage client document types</Link>
                  </small>
                </RoleGate>
              </div>
              <div className="field">
                <label htmlFor="client_doc_title">Title (optional)</label>
                <input id="client_doc_title" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="client_doc_file">File (PDF, PNG, JPG)</label>
                <input id="client_doc_file" type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>Upload</button>
            </div>
          </form>
        </RoleGate>
      </div>

      </div>
      )}

      {tab === "messages" && (
      <div role="tabpanel" id="client-panel-messages" aria-labelledby="client-tab-messages" tabIndex={0} className="exec-tabpanel">
        <ClientCorrespondence clientId={Number(clientId)} />
      </div>
      )}

      {tab === "portal" && (
      <div role="tabpanel" id="client-panel-portal" aria-labelledby="client-tab-portal" tabIndex={0} className="exec-tabpanel">
      <div className="card">
        <div className="page-header" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Customer Portal</h2>
          <div className="actions-row">
            <Link className="btn-secondary btn-sm" to={`/claims?client_id=${clientId}`}>
              Claims ({claimsQuery.data?.claims.length ?? 0})
            </Link>
            <Link className="btn-secondary btn-sm" to="/quote-requests">Quote Requests ({nQuoteRequests})</Link>
            <Link className="btn-secondary btn-sm" to="?tab=messages">Messages ({nMessages})</Link>
          </div>
        </div>

        <h3 style={{ marginTop: "1rem" }}>Portal Access</h3>
        {portalNotice && <div className="flash flash-success">{portalNotice}</div>}
        {portalUsers.length > 0 ? (
          <div className="exec-table-wrap">
            <table className="exec-table is-static">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Last Login</th>
                  <RoleGate need="write"><th></th></RoleGate>
                </tr>
              </thead>
              <tbody>
                {portalUsers.map((pu) => (
                  <tr key={pu.id}>
                    <td>{pu.name}</td>
                    <td>{pu.email}</td>
                    <td>{pu.last_login_at ? pu.last_login_at.slice(0, 10) : "Never"}</td>
                    <RoleGate need="write">
                      <td className="actions-row">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => handleResetPortalAccess(pu.id)}>
                          Reset password
                        </button>
                        <button type="button" className="btn-danger btn-sm" onClick={() => handleDeletePortalAccess(pu.id)}>
                          Remove
                        </button>
                      </td>
                    </RoleGate>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">This client has no portal login yet.</p>
        )}
        <RoleGate need="write">
          {error && <div className="flash flash-error">{error}</div>}
          <form onSubmit={handleCreatePortalAccess} style={{ marginTop: "1rem" }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="portal_name">Contact name</label>
                <input
                  id="portal_name"
                  required
                  value={portalForm.name}
                  onChange={(e) => setPortalForm({ ...portalForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="portal_email">Email</label>
                <input
                  id="portal_email"
                  type="email"
                  required
                  value={portalForm.email}
                  onChange={(e) => setPortalForm({ ...portalForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>Create portal access</button>
            </div>
          </form>
        </RoleGate>
      </div>
      </div>
      )}
      </section>
    </div>
  );
}

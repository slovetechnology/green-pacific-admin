import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { PortalSignupsPanel, type PortalSignupsResponse } from "../components/PortalSignupsPanel";
import "@/shared/styles/executive.css";

interface ClientRow {
  id: number;
  name: string;
  client_ref: string | null;
  city: string | null;
  state: string | null;
  n_tx: number;
  balance_os: number;
}

interface ClientsListResponse {
  clients: ClientRow[];
  q: string;
  page: number;
  totalPages: number;
  total: number;
}

// The slice of GET /api/clients/:id the detail pane shows.
interface ClientPreview {
  client: { id: number; name: string; client_ref: string | null; city: string | null; state: string | null };
  transactions: {
    id: number;
    policy_no: string | null;
    class_of_business: string | null;
    insurer_name: string;
    trans_date: string | null;
    balance_os: number;
    status: string | null;
  }[];
  contacts: unknown[];
  deals: unknown[];
  accountManager: { id: number; username: string } | null;
  nQuoteRequests: number;
  nMessages: number;
}

function ClientPaneBody({ clientId }: { clientId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["client-preview", clientId],
    queryFn: () => api.get<ClientPreview>(`/api/clients/${clientId}`),
  });
  if (isLoading) return <p className="exec-state">Loading client…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this client.</p>;

  const open = data.transactions.filter((t) => t.balance_os > 0);
  const owed = open.reduce((sum, t) => sum + t.balance_os, 0);
  const recent = data.transactions.slice(0, 6);
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Reference</dt><dd>{data.client.client_ref || "—"}</dd></div>
        <div className="exec-field"><dt>Location</dt><dd>{[data.client.city, data.client.state].filter(Boolean).join(", ") || "—"}</dd></div>
        <div className="exec-field"><dt>Account manager</dt><dd>{data.accountManager?.username || "Unassigned"}</dd></div>
        <div className="exec-field"><dt>Policies</dt><dd>{data.transactions.length}</dd></div>
        <div className="exec-field">
          <dt>Balance outstanding</dt>
          <dd className={owed > 0 ? "is-crit" : undefined}>{fmtMoney(owed)}</dd>
        </div>
        <div className="exec-field"><dt>Contacts · Deals</dt><dd>{data.contacts.length} · {data.deals.length}</dd></div>
        <div className="exec-field"><dt>Quote requests · Messages</dt><dd>{data.nQuoteRequests} · {data.nMessages}</dd></div>
      </dl>

      <section>
        <h3 className="exec-sub">Recent policies</h3>
        {recent.length === 0 ? (
          <p className="exec-state">No policies yet.</p>
        ) : (
          <div className="exec-table-wrap exec-panel">
            <table className="exec-table is-static exec-mini-table">
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="wrap">
                      <Link to={`/transactions/${t.id}`}>{t.policy_no || `#${t.id}`}</Link>
                      <div className="exec-dl-note">
                        {t.insurer_name} · {t.class_of_business || "—"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="num">{fmtMoney(t.balance_os)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// Master-detail: the list of clients on the left, the selected client's summary on the right. The pick
// lives in the URL (?selected=) so a refresh or the back button keeps it. On a narrow screen the two
// stack, and nothing is auto-selected so the list comes first.
export function ClientsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const q = searchParams.get("q") || "";
  const selectedId = Number(searchParams.get("selected")) || null;
  const [qInput, setQInput] = useState(q);
  // Agents see only their own book, and an unlinked sign-up is in nobody's, so they get no sign-ups tab.
  const { user } = useAuth();
  const canSeeSignups = Boolean(user && !user.isAgent);
  const tab = canSeeSignups && searchParams.get("tab") === "signups" ? "signups" : "clients";

  const { data, isLoading } = useQuery({
    queryKey: ["clients", q, page],
    queryFn: () => api.get<ClientsListResponse>(`/api/clients?q=${encodeURIComponent(q)}&page=${page}`),
    enabled: tab === "clients",
  });
  // Sign-ups not yet linked to a client. Fetched on both tabs so the tab can show how many are waiting.
  const signups = useQuery({
    queryKey: ["portal-signups", tab === "signups" ? q : "", tab === "signups" ? page : 1],
    queryFn: () => api.get<PortalSignupsResponse>(tab === "signups" ? `/api/clients/portal-signups?q=${encodeURIComponent(q)}&page=${page}` : "/api/clients/portal-signups"),
    enabled: canSeeSignups,
  });
  const rows = data?.clients ?? [];
  const selected = rows.find((c) => c.id === selectedId) ?? null;

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    setSearchParams(params, { replace: true });
  }

  // Wide screens open with the first client showing, as the reference layout does.
  useEffect(() => {
    if (tab !== "clients") return;
    if (!selected && rows.length && window.matchMedia("(min-width: 1000px)").matches) update({ selected: String(rows[0].id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selected]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    update({ q: qInput, page: "1", selected: "", account: "" });
  }

  function chooseTab(next: "clients" | "signups") {
    if (next === tab) return;
    setQInput("");
    update({ tab: next === "signups" ? "signups" : "", q: "", page: "1", selected: "", account: "" });
  }

  const unfilteredSignups = !q || tab !== "signups" ? signups.data?.total : undefined;
  const headerNote =
    tab === "signups"
      ? signups.data
        ? `${signups.data.total.toLocaleString()} ${q ? "matching " : ""}portal sign-up${signups.data.total === 1 ? "" : "s"} not linked to a client`
        : "Loading sign-ups…"
      : data
        ? `${data.total.toLocaleString()} ${q ? "matching " : ""}client${data.total === 1 ? "" : "s"}`
        : "Loading clients…";

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Clients & Sales</span>
          <h1>Clients</h1>
          <p className="exec-dl-note">{headerNote}</p>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <Link className="btn btn-secondary btn-sm" to="/clients/import">
              Upload clients
            </Link>
            <Link className="btn btn-secondary btn-sm" to="/clients/contacts-import">
              Upload contacts
            </Link>
            <button type="button" className="btn btn-sm" onClick={() => navigate("/clients/new")}>
              + New client
            </button>
          </div>
        </RoleGate>
      </header>

      {canSeeSignups && (
        <div className="exec-tabs" role="tablist" aria-label="Client list">
          <button type="button" role="tab" aria-selected={tab === "clients"} className={`exec-tab${tab === "clients" ? " is-active" : ""}`} onClick={() => chooseTab("clients")}>
            Clients
          </button>
          <button type="button" role="tab" aria-selected={tab === "signups"} className={`exec-tab${tab === "signups" ? " is-active" : ""}`} onClick={() => chooseTab("signups")}>
            Portal sign-ups (unlinked) {unfilteredSignups != null && <span className="exec-tab-count">{unfilteredSignups}</span>}
          </button>
        </div>
      )}

      <form className="exec-filters" role="search" onSubmit={handleSearch}>
        <label className="exec-search">
          <span>Search</span>
          <input type="search" placeholder={tab === "signups" ? "Name, email, phone…" : "Name, reference, city…"} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
        {q && (
          <button
            type="button"
            className="exec-filter-clear"
            onClick={() => {
              setQInput("");
              update({ q: "", page: "1", selected: "", account: "" });
            }}
          >
            Clear search
          </button>
        )}
      </form>

      {tab === "signups" ? (
        <PortalSignupsPanel data={signups.data} isLoading={signups.isLoading} />
      ) : (
      <div className="clients-split">
        <section className="clients-list" aria-label="Clients">
          {isLoading && <p className="exec-state">Loading clients…</p>}
          {!isLoading && rows.length === 0 && <p className="exec-state">No clients found.</p>}
          <ul>
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" className={`client-card${c.id === selectedId ? " is-selected" : ""}`} aria-pressed={c.id === selectedId} onClick={() => update({ selected: String(c.id) })}>
                  <span className="client-card-top">
                    <strong>{c.name}</strong>
                    <span className={`client-card-balance${c.balance_os > 0 ? " is-crit" : ""}`}>{c.balance_os > 0 ? fmtMoneyShort(c.balance_os) : "No balance"}</span>
                  </span>
                  <span className="client-card-sub">
                    <span>{[c.city, c.state].filter(Boolean).join(", ") || "No location"}</span>
                    <span>
                      {c.n_tx} {c.n_tx === 1 ? "policy" : "policies"}
                    </span>
                  </span>
                  {c.client_ref && <span className="client-card-ref">{c.client_ref}</span>}
                </button>
              </li>
            ))}
          </ul>
          {data && data.totalPages > 1 && (
            <div className="clients-paging">
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1), selected: "" })}>
                Previous
              </button>
              <span>
                Page {data.page} of {data.totalPages}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.totalPages} onClick={() => update({ page: String(data.page + 1), selected: "" })}>
                Next
              </button>
            </div>
          )}
        </section>

        <section className="clients-detail" aria-label="Client summary" aria-live="polite">
          {selected ? (
            <>
              <header className="clients-detail-head">
                <div>
                  <span className="exec-eyebrow">{selected.client_ref || "Client"}</span>
                  <h2>{selected.name}</h2>
                </div>
                <div className="clients-detail-actions">
                  <RoleGate need="write">
                    <Link className="btn btn-secondary btn-sm" to={`/transactions/new?client_id=${selected.id}`}>
                      + Add policy
                    </Link>
                  </RoleGate>
                  <Link className="btn btn-sm" to={`/clients/${selected.id}`}>
                    Open full record
                  </Link>
                </div>
              </header>
              <ClientPaneBody clientId={selected.id} />
            </>
          ) : (
            <p className="exec-state">{rows.length ? "Select a client to see their summary." : ""}</p>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

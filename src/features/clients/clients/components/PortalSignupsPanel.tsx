import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { alertDialog, confirmDialog } from "@/shared/components/Dialogs";

// The "Portal sign-ups" tab of the Clients page: customer-portal accounts that no client owns yet
// (backend: modules/clients/clients/portalSignups.js). Verifying a customer's KYC links them on its own;
// this is for staff who want to see who signed up, or who already know which client someone is.

export interface PortalSignupRow {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  signup_source: string | null;
  created_at: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
}

export interface PortalSignupsResponse {
  signups: PortalSignupRow[];
  q: string;
  page: number;
  totalPages: number;
  total: number;
}

interface Suggestion {
  client_id: number;
  name: string;
  lifecycle_stage: string | null;
  reasons: string[];
}

interface PortalSignupDetail {
  account: PortalSignupRow & { client_id: number | null };
  linkedClient: { id: number; name: string } | null;
  kyc: { id: number; reference_no: string; status: string; submitted_at: string | null }[];
  nQuoteRequests: number;
  suggestions: Suggestion[];
}

interface ClientOption {
  id: number;
  name: string;
}

const day = (value: string | null) => (value ? String(value).slice(0, 10) : "—");

function SignupPaneBody({ accountId, onLinked }: { accountId: number; onLinked: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-signup", accountId],
    queryFn: () => api.get<PortalSignupDetail>(`/api/clients/portal-signups/${accountId}`),
  });
  const { data: options } = useQuery({
    queryKey: ["clients", "options"],
    queryFn: () => api.get<{ clients: ClientOption[] }>("/api/clients/options"),
  });
  const [chosen, setChosen] = useState("");
  useEffect(() => setChosen(""), [accountId]);

  const link = useMutation({
    mutationFn: (body: { client_id: number } | { create: true }) =>
      api.post<{ client: ClientOption; created: boolean }>(`/api/clients/portal-signups/${accountId}/link`, body),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["portal-signups"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] }); // the list, its count and the options picker
      onLinked();
      void alertDialog(`${result.created ? "Created client" : "Linked to"} “${result.client.name}”.`);
    },
    onError: (err) => void alertDialog(err instanceof ApiError ? err.message : "Could not link this account."),
  });

  if (isLoading) return <p className="exec-state">Loading account…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this account.</p>;
  const { account } = data;

  async function linkTo(clientId: number, clientName: string) {
    const ok = await confirmDialog({
      title: "Link portal account",
      message: `Link ${account.email} to “${clientName}”? This login will see that client's policies, claims and messages in the customer portal. Only do this if you are sure it is the same customer.`,
      confirmLabel: "Link account",
    });
    if (ok) link.mutate({ client_id: clientId });
  }

  async function createClient() {
    const ok = await confirmDialog({
      title: "Create client",
      message: `Create a new client “${account.name || account.email}” from this sign-up and link the account to it?`,
      confirmLabel: "Create client",
    });
    if (ok) link.mutate({ create: true });
  }

  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Email</dt><dd>{account.email}</dd></div>
        <div className="exec-field"><dt>Phone</dt><dd>{account.phone || "—"}</dd></div>
        <div className="exec-field"><dt>Signed up</dt><dd>{day(account.created_at)}</dd></div>
        <div className="exec-field">
          <dt>Email verified</dt>
          <dd className={account.email_verified_at ? undefined : "is-crit"}>{account.email_verified_at ? day(account.email_verified_at) : "Not yet"}</dd>
        </div>
        <div className="exec-field"><dt>Last sign-in</dt><dd>{day(account.last_login_at)}</dd></div>
        <div className="exec-field"><dt>Quote requests</dt><dd>{data.nQuoteRequests}</dd></div>
      </dl>

      <section>
        <h3 className="exec-sub">KYC</h3>
        {data.kyc.length === 0 ? (
          <p className="exec-state">No KYC submitted yet. Verifying a KYC links the account to a client automatically.</p>
        ) : (
          <ul className="exec-dl-note">
            {data.kyc.map((k) => (
              <li key={k.id}>
                <Link to={`/kyc-submissions/${k.id}`}>{k.reference_no}</Link> <StatusBadge status={k.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.linkedClient ? (
        <p className="exec-state">
          Linked to <Link to={`/clients/${data.linkedClient.id}`}>{data.linkedClient.name}</Link>.
        </p>
      ) : (
        <RoleGate need="write">
          <section>
            <h3 className="exec-sub">Possible matches</h3>
            {data.suggestions.length === 0 ? (
              <p className="exec-state">No existing client looks like this customer.</p>
            ) : (
              <ul className="portal-signup-matches">
                {data.suggestions.map((s) => (
                  <li key={s.client_id}>
                    <span>
                      <Link to={`/clients/${s.client_id}`}>{s.name}</Link>
                      <span className="exec-dl-note"> · {s.reasons.join(", ")}</span>
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={link.isPending} onClick={() => void linkTo(s.client_id, s.name)}>
                      Link
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="exec-sub">Link or create</h3>
            <div className="portal-signup-link">
              <label>
                <span className="sr-only">Existing client</span>
                <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  <option value="">Choose an existing client…</option>
                  {(options?.clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!chosen || link.isPending}
                onClick={() => {
                  const client = options?.clients.find((c) => c.id === Number(chosen));
                  if (client) void linkTo(client.id, client.name);
                }}
              >
                Link to client
              </button>
              <button type="button" className="btn btn-sm" disabled={link.isPending} onClick={() => void createClient()}>
                + Create client from sign-up
              </button>
            </div>
          </section>
        </RoleGate>
      )}
    </>
  );
}

// Same master-detail layout as the clients tab; the pick is ?account= in the URL.
export function PortalSignupsPanel({ data, isLoading }: { data: PortalSignupsResponse | undefined; isLoading: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get("account")) || null;
  const rows = data?.signups ?? [];
  const selected = rows.find((s) => s.id === selectedId) ?? null;

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    if (!selected && rows.length && window.matchMedia("(min-width: 1000px)").matches) update({ account: String(rows[0].id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selected]);

  return (
    <div className="clients-split">
      <section className="clients-list" aria-label="Portal sign-ups">
        {isLoading && <p className="exec-state">Loading sign-ups…</p>}
        {!isLoading && rows.length === 0 && <p className="exec-state">No unlinked portal sign-ups.</p>}
        <ul>
          {rows.map((s) => (
            <li key={s.id}>
              <button type="button" className={`client-card${s.id === selectedId ? " is-selected" : ""}`} aria-pressed={s.id === selectedId} onClick={() => update({ account: String(s.id) })}>
                <span className="client-card-top">
                  <strong>{s.name || s.email}</strong>
                  <span className={`client-card-balance${s.email_verified_at ? "" : " is-crit"}`}>{s.email_verified_at ? "Email verified" : "Unverified email"}</span>
                </span>
                <span className="client-card-sub">
                  <span>{s.email}</span>
                  <span>Signed up {day(s.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {data && data.totalPages > 1 && (
          <div className="clients-paging">
            <button type="button" className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1), account: "" })}>
              Previous
            </button>
            <span>
              Page {data.page} of {data.totalPages}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={data.page >= data.totalPages} onClick={() => update({ page: String(data.page + 1), account: "" })}>
              Next
            </button>
          </div>
        )}
      </section>

      <section className="clients-detail" aria-label="Sign-up summary" aria-live="polite">
        {selected ? (
          <>
            <header className="clients-detail-head">
              <div>
                <span className="exec-eyebrow">Portal sign-up · not linked to a client</span>
                <h2>{selected.name || selected.email}</h2>
              </div>
              <div className="clients-detail-actions">
                <Link className="btn btn-secondary btn-sm" to={`/portal/activity?customer_user_id=${selected.id}`}>
                  Activity
                </Link>
              </div>
            </header>
            <SignupPaneBody accountId={selected.id} onLinked={() => update({ account: "" })} />
          </>
        ) : (
          <p className="exec-state">{rows.length ? "Select a sign-up to see the account." : ""}</p>
        )}
      </section>
    </div>
  );
}

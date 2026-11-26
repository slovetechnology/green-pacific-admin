import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { MetricStrip, type Metric } from "@/shared/components/exec/MetricStrip";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import { fmtMoney, fmtMoneyShort } from "@/shared/lib/format";
import "@/shared/styles/executive.css";

interface ClaimRow {
  id: number;
  claim_no: string;
  client_name: string;
  status: string;
  source: string;
  date_of_loss: string | null;
  date_reported: string | null;
  claimed_amount: number;
  approved_amount: number;
  adjuster_name: string | null;
  // The loss adjusters directory firm the adjuster name matches, if any.
  loss_adjuster: { id: number; adjuster_ref: string | null } | null;
  // The policy's insurer, or every insurer of a co-insured policy with its share.
  insurers?: string | null;
  coinsured?: boolean;
  sla_overdue?: number;
  sla_next?: { label: string; due: string; state: string } | null;
}

interface Response {
  claims: ClaimRow[];
  q: string;
  status: string;
  clientId: string;
  statuses: string[];
  // Directory firms named on at least one claim, with how many.
  adjusterOptions: { id: number; adjuster_ref: string | null; name: string; claims: number }[];
}

// The slice of GET /api/claims/:id the drawer shows.
interface ClaimDetail {
  claim: {
    id: number;
    client_id: number;
    loss_type: string | null;
    description: string | null;
    insurer_claim_no: string | null;
    date_notified_to_insurer: string | null;
  };
  transaction: {
    id: number;
    policy_no: string | null;
    class_of_business: string | null;
    insurer_name?: string | null;
    coinsurance?: { id: number; insurer: string; proportion: number }[] | null;
  } | null;
  events: { id: number; event_date: string | null; status: string | null; note: string | null; created_by: string | null }[];
  documents: unknown[];
}

// Statuses after which no more broker work is expected.
const CLOSED_STATUSES = ["Settled", "Closed", "Repudiated", "Rejected", "Declined"];

function ClaimDrawerBody({ row }: { row: ClaimRow }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["claim-preview", row.id],
    queryFn: () => api.get<ClaimDetail>(`/api/claims/${row.id}`),
  });
  if (isLoading) return <p className="exec-state">Loading claim…</p>;
  if (isError || !data) return <p className="exec-state is-crit">Could not load this claim.</p>;

  const c = data.claim;
  const events = data.events.slice(0, 6);
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Client</dt><dd><Link to={`/clients/${c.client_id}`}>{row.client_name}</Link></dd></div>
        <div className="exec-field">
          <dt>Policy</dt>
          <dd>{data.transaction ? <Link to={`/transactions/${data.transaction.id}`}>{data.transaction.policy_no || `#${data.transaction.id}`}</Link> : "Not linked"}</dd>
        </div>
        <div className="exec-field">
          <dt>{data.transaction?.coinsurance ? "Insurers (co-insured)" : "Insurer"}</dt>
          <dd>
            {data.transaction?.coinsurance
              ? data.transaction.coinsurance.map((m) => `${m.insurer} (${Number((m.proportion * 100).toFixed(4))}%)`).join(", ")
              : data.transaction?.insurer_name || "—"}
          </dd>
        </div>
        <div className="exec-field"><dt>Loss type</dt><dd>{c.loss_type || "—"}</dd></div>
        <div className="exec-field"><dt>Date of loss</dt><dd>{row.date_of_loss || "—"}</dd></div>
        <div className="exec-field"><dt>Reported</dt><dd>{row.date_reported || "—"}</dd></div>
        <div className="exec-field"><dt>Notified to insurer</dt><dd>{c.date_notified_to_insurer || "—"}</dd></div>
        <div className="exec-field"><dt>Insurer claim no.</dt><dd>{c.insurer_claim_no || "—"}</dd></div>
        <div className="exec-field"><dt>Claimed</dt><dd>{fmtMoney(row.claimed_amount)}</dd></div>
        <div className="exec-field"><dt>Approved</dt><dd>{fmtMoney(row.approved_amount)}</dd></div>
        <div className="exec-field"><dt>Documents</dt><dd>{data.documents.length}</dd></div>
      </dl>

      {c.description && (
        <section>
          <h3 className="exec-sub">Description</h3>
          <p className="exec-terms">{c.description}</p>
        </section>
      )}

      <section>
        <h3 className="exec-sub">Recent activity</h3>
        {events.length === 0 ? (
          <p className="exec-state">No activity logged.</p>
        ) : (
          <ul className="exec-list">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.event_date || "—"}</strong> {e.status && <StatusBadge status={e.status} />}
                {e.note && <div className="exec-dl-note">{e.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function ClaimsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "";
  const clientId = searchParams.get("client_id") || "";
  // A loss adjuster id, "none" or "other" (see the Loss adjuster filter below).
  const adjuster = searchParams.get("adjuster") || "";
  const [qInput, setQInput] = useState(q);
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const closeDrawer = useCallback(() => setSelected(null), []);

  const { data, isLoading } = useQuery({
    queryKey: ["claims", q, status, clientId, adjuster],
    queryFn: () =>
      api.get<Response>(
        `/api/claims?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&client_id=${encodeURIComponent(clientId)}&adjuster=${encodeURIComponent(adjuster)}`
      ),
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const columns: DataGridColumn<ClaimRow>[] = [
    { key: "claim_no", header: "Claim No", render: (c) => <Link to={`/claims/${c.id}`}>{c.claim_no}</Link> },
    { key: "client", header: "Client", render: (c) => c.client_name },
    {
      key: "insurer",
      header: "Insurer",
      render: (c) => (c.coinsured ? <span title="The loss is shared by the insurers in proportion to their shares">Co-insured: {c.insurers}</span> : c.insurers || "—"),
    },
    { key: "source", header: "Source", render: (c) => (c.source === "Portal" ? "Self-reported" : "Staff") },
    { key: "date_of_loss", header: "Date of Loss", render: (c) => c.date_of_loss || "—" },
    { key: "date_reported", header: "Date Reported", render: (c) => c.date_reported || "—" },
    { key: "claimed_amount", header: "Claimed", align: "right", render: (c) => fmtMoney(c.claimed_amount) },
    { key: "approved_amount", header: "Approved", align: "right", render: (c) => fmtMoney(c.approved_amount) },
    {
      key: "loss_adjuster",
      header: "Loss Adjuster",
      render: (c) =>
        !c.adjuster_name ? (
          "—"
        ) : c.loss_adjuster ? (
          <>
            <Link to={`/loss-adjusters?preview=${c.loss_adjuster.id}`} onClick={(ev) => ev.stopPropagation()}>
              {c.adjuster_name}
            </Link>
            {c.loss_adjuster.adjuster_ref && <div className="exec-dl-note">{c.loss_adjuster.adjuster_ref}</div>}
          </>
        ) : (
          <>
            {c.adjuster_name}
            <div className="exec-dl-note">Not in directory</div>
          </>
        ),
    },
    { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
    {
      key: "service",
      header: "Service",
      render: (c) =>
        c.sla_overdue ? (
          <span className="badge badge-cancelled" title={c.sla_next ? `${c.sla_next.label}, due ${c.sla_next.due}` : undefined}>{c.sla_overdue} overdue</span>
        ) : c.sla_next ? (
          <span className="text-muted" style={{ fontSize: "0.85rem" }}>{c.sla_next.label} by {c.sla_next.due}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "preview",
      header: <span className="sr-only">Preview</span>,
      align: "right",
      render: (c) => (
        <button type="button" className="exec-rowbtn" onClick={() => setSelected(c)} aria-label={`Preview claim ${c.claim_no}`}>
          Preview
        </button>
      ),
    },
  ];

  // This endpoint is not paginated, so the figures cover every listed claim.
  const rows = data?.claims ?? [];
  const open = rows.filter((c) => !CLOSED_STATUSES.includes(c.status));
  const claimed = rows.reduce((sum, c) => sum + (Number(c.claimed_amount) || 0), 0);
  const approved = rows.reduce((sum, c) => sum + (Number(c.approved_amount) || 0), 0);
  const portal = rows.filter((c) => c.source === "Portal").length;
  const metrics: Metric[] = [
    { key: "total", label: q || status || clientId || adjuster ? "Matching claims" : "All claims", value: rows.length },
    { key: "open", label: "Open", value: open.length, tone: open.length ? "warn" : "neutral" },
    { key: "claimed", label: "Claimed", value: fmtMoneyShort(claimed), title: fmtMoney(claimed) },
    { key: "approved", label: "Approved", value: fmtMoneyShort(approved), title: fmtMoney(approved), tone: "good" },
    { key: "portal", label: "Self-reported", value: portal, note: "Filed from the customer portal" },
  ];
  const activeFilters = [q, status, clientId, adjuster].filter(Boolean).length;

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Claims</span>
          <h1>Claims</h1>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <Link className="btn btn-secondary btn-sm" to="/claims/import">
              Upload claims
            </Link>
            <button type="button" className="btn btn-sm" onClick={() => navigate("/claims/new")}>
              + New claim
            </button>
          </div>
        </RoleGate>
      </header>

      <MetricStrip metrics={metrics} label="Claims summary" />

      <form
        className="exec-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", qInput);
        }}
      >
        <label className="exec-search">
          <span>Search</span>
          <input type="search" placeholder="Claim no, client or adjuster…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <label className="exec-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => updateParam("status", e.target.value)}>
            <option value="">All</option>
            {data?.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="exec-filter">
          <span>Loss adjuster</span>
          <select value={adjuster} onChange={(e) => updateParam("adjuster", e.target.value)}>
            <option value="">All</option>
            <option value="none">No adjuster</option>
            <option value="other">Not in directory</option>
            {adjuster && !["none", "other"].includes(adjuster) && !data?.adjusterOptions.some((a) => String(a.id) === adjuster) && (
              <option value={adjuster}>Selected firm</option>
            )}
            {data?.adjusterOptions.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.adjuster_ref ? `${a.adjuster_ref} · ` : ""}
                {a.name} ({a.claims})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          Search
        </button>
        {activeFilters > 0 && (
          <button
            type="button"
            className="exec-filter-clear"
            onClick={() => {
              setQInput("");
              setSearchParams({});
            }}
          >
            Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
          </button>
        )}
      </form>

      <DataGrid
        columns={columns}
        rows={data?.claims}
        isLoading={isLoading}
        getRowKey={(c) => c.id}
        onRowClick={setSelected}
        isRowSelected={(c) => c.id === selected?.id}
        emptyMessage="No claims found."
      />

      <SideDrawer
        open={selected !== null}
        onClose={closeDrawer}
        title={selected?.claim_no ?? "Claim"}
        subtitle={selected ? `${selected.client_name} · ${selected.status}` : undefined}
        footer={
          selected && (
            <Link className="btn btn-sm" to={`/claims/${selected.id}`}>
              Open claim
            </Link>
          )
        }
      >
        {selected && <ClaimDrawerBody row={selected} />}
      </SideDrawer>
    </div>
  );
}

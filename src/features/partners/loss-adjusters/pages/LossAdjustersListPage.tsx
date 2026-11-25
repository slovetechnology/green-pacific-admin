import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { ListSearch } from "@/shared/components/ListSearch";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { RoleGate } from "@/app/guards/RoleGate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { SideDrawer } from "@/shared/components/exec/SideDrawer";
import { fmtMoney } from "@/shared/lib/format";
import "@/shared/styles/executive.css";

export interface LossAdjusterRow {
  id: number;
  adjuster_ref: string | null;
  name: string;
  contact_person: string | null;
  address: string | null;
  office_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  website: string | null;
  licence_no: string | null;
  licence_status: string;
  source: string | null;
  notes: string | null;
  is_active: number;
}

interface ListResponse {
  lossAdjusters: LossAdjusterRow[];
  page: number;
  totalPages: number;
  total: number;
  statuses: string[];
}

// The slice of GET /api/loss-adjusters/:id the drawer shows beyond the row itself.
interface LossAdjusterDetail {
  lossAdjuster: LossAdjusterRow;
  claimCount: number;
  claims: { id: number; claim_no: string | null; status: string | null; date_of_loss: string | null; claimed_amount: number | null; client_name: string }[];
}

const websiteHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

function LossAdjusterDrawerBody({ row }: { row: LossAdjusterRow }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["loss-adjusters", "preview", row.id],
    queryFn: () => api.get<LossAdjusterDetail>(`/api/loss-adjusters/${row.id}`),
  });
  const r = data?.lossAdjuster ?? row;
  const emails = (r.email || "").split(",").map((e) => e.trim()).filter(Boolean);
  return (
    <>
      <dl className="exec-fields">
        <div className="exec-field"><dt>Reference</dt><dd>{r.adjuster_ref || "—"}</dd></div>
        <div className="exec-field"><dt>Contact person</dt><dd>{r.contact_person || "—"}</dd></div>
        <div className="exec-field"><dt>Office address</dt><dd>{r.address || "—"}</dd></div>
        <div className="exec-field"><dt>Office phone</dt><dd>{r.office_phone || "—"}</dd></div>
        <div className="exec-field"><dt>Mobile phone</dt><dd>{r.mobile_phone || "—"}</dd></div>
        <div className="exec-field">
          <dt>Email</dt>
          <dd>
            {emails.length
              ? emails.map((e) => (
                  <div key={e}>
                    <a href={`mailto:${e}`}>{e}</a>
                  </div>
                ))
              : "—"}
          </dd>
        </div>
        <div className="exec-field">
          <dt>Website</dt>
          <dd>{r.website ? <a href={websiteHref(r.website)} target="_blank" rel="noreferrer">{r.website}</a> : "—"}</dd>
        </div>
        <div className="exec-field"><dt>NAICOM licence no.</dt><dd>{r.licence_no || "—"}</dd></div>
        <div className="exec-field"><dt>Licence status</dt><dd className={r.licence_status === "Active" ? undefined : "is-crit"}>{r.licence_status}</dd></div>
        <div className="exec-field"><dt>On claim picker</dt><dd>{r.is_active ? "Yes" : "No (inactive)"}</dd></div>
        <div className="exec-field"><dt>Source</dt><dd>{r.source || "—"}</dd></div>
        {r.notes && <div className="exec-field"><dt>Notes</dt><dd>{r.notes}</dd></div>}
      </dl>

      <section>
        <h3 className="exec-sub">Claims assigned{data ? ` (${data.claimCount})` : ""}</h3>
        {isLoading ? (
          <p className="exec-state">Loading claims…</p>
        ) : isError || !data ? (
          <p className="exec-state is-crit">Could not load this firm's claims.</p>
        ) : data.claims.length === 0 ? (
          <p className="exec-state">No claims name this firm as adjuster yet.</p>
        ) : (
          <div className="exec-table-wrap exec-panel">
            <table className="exec-table is-static exec-mini-table">
              <thead>
                <tr>
                  <th scope="col">Claim</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map((c) => (
                  <tr key={c.id}>
                    <td className="wrap">
                      <Link to={`/claims/${c.id}`}>{c.claim_no || `#${c.id}`}</Link>
                      <div className="exec-dl-note">
                        {c.client_name} · {c.date_of_loss || "—"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="num">{fmtMoney(c.claimed_amount ?? 0)}</td>
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

const phones = (r: LossAdjusterRow) => [r.office_phone, r.mobile_phone].filter(Boolean).join(", ") || "—";

export function LossAdjustersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(searchParams.get("page") || "1");
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "";
  const [qInput, setQInput] = useState(q);
  const [picked, setPicked] = useState<LossAdjusterRow | null>(null);
  // ?preview=<id> (linked from a claim's adjuster card) opens that firm's drawer on arrival.
  const previewId = Number(searchParams.get("preview") || 0);
  const previewQuery = useQuery({
    queryKey: ["loss-adjusters", "preview", previewId],
    queryFn: () => api.get<LossAdjusterDetail>(`/api/loss-adjusters/${previewId}`),
    enabled: previewId > 0 && !picked,
  });
  const selected = picked ?? (previewId > 0 ? previewQuery.data?.lossAdjuster ?? null : null);
  const setSelected = setPicked;
  const closeDrawer = useCallback(() => {
    setPicked(null);
    if (searchParams.has("preview")) {
      const next = new URLSearchParams(searchParams);
      next.delete("preview");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  // Searching waits for a pause in typing, then goes back to page 1.
  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (qInput) next.set("q", qInput);
      else next.delete("q");
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, searchParams, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["loss-adjusters", page, q, status],
    queryFn: () =>
      api.get<ListResponse>(`/api/loss-adjusters?page=${page}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  });

  const columns: DataGridColumn<LossAdjusterRow>[] = [
    { key: "ref", header: "Ref", render: (r) => r.adjuster_ref || "—" },
    {
      key: "name",
      header: "Firm",
      render: (r) => (
        <>
          <Link to={`/loss-adjusters/${r.id}/edit`} onClick={(ev) => ev.stopPropagation()}>{r.name}</Link>
          {!r.is_active && <div className="exec-dl-note">Inactive</div>}
          {r.contact_person && <div className="exec-dl-note">{r.contact_person}</div>}
        </>
      ),
    },
    { key: "address", header: "Office address", render: (r) => <span className="wrap">{r.address || "—"}</span> },
    { key: "phone", header: "Phone", render: phones },
    {
      key: "email",
      header: "Email",
      render: (r) =>
        r.email
          ? r.email.split(",").map((e) => (
              <div key={e}>
                <a href={`mailto:${e.trim()}`} onClick={(ev) => ev.stopPropagation()}>{e.trim()}</a>
              </div>
            ))
          : "—",
    },
    { key: "licence", header: "NAICOM licence", render: (r) => [r.licence_no, r.licence_status].filter(Boolean).join(" · ") },
    {
      key: "preview",
      header: <span className="sr-only">Preview</span>,
      align: "right",
      render: (r) => (
        <button type="button" className="exec-rowbtn" onClick={() => setSelected(r)} aria-label={`Preview ${r.name}`}>
          Preview
        </button>
      ),
    },
  ];

  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("status", value);
    else next.delete("status");
    next.delete("page");
    setSearchParams(next);
  };

  return (
    <div className="exec">
      <header className="exec-header">
        <div>
          <span className="exec-eyebrow">Directory</span>
          <h1>Loss Adjusters</h1>
        </div>
        <RoleGate need="write">
          <div className="exec-header-actions">
            <button type="button" className="btn btn-sm" onClick={() => navigate("/loss-adjusters/new")}>
              + New loss adjuster
            </button>
          </div>
        </RoleGate>
      </header>

      <p className="field-hint">
        Loaded from the Institute of Loss Adjusters of Nigeria (ILAN) members directory. Confirm each firm's NAICOM
        licence before appointing it and record the licence number and status here.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <ListSearch value={qInput} onChange={setQInput} placeholder="Ref, firm, contact, address, phone or email…" />
        </div>
        <select aria-label="Licence status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All licence statuses</option>
          {(data?.statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <DataGrid
        columns={columns}
        rows={data?.lossAdjusters}
        isLoading={isLoading}
        getRowKey={(r) => r.id}
        onRowClick={setSelected}
        isRowSelected={(r) => r.id === selected?.id}
        emptyMessage="No loss adjusters found."
        paging={
          data
            ? {
                page: data.page,
                totalPages: data.totalPages,
                total: data.total,
                onPageChange: (p) => {
                  const next = new URLSearchParams(searchParams);
                  next.set("page", String(p));
                  setSearchParams(next);
                },
              }
            : undefined
        }
      />

      <SideDrawer
        open={selected !== null}
        onClose={closeDrawer}
        title={selected?.name ?? "Loss adjuster"}
        subtitle="Loss adjuster preview"
        footer={
          selected && (
            <RoleGate need="write">
              <Link className="btn btn-sm" to={`/loss-adjusters/${selected.id}/edit`}>
                Edit
              </Link>
            </RoleGate>
          )
        }
      >
        {selected && <LossAdjusterDrawerBody row={selected} />}
      </SideDrawer>
    </div>
  );
}

import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";

interface Entry {
  id: number;
  created_at: string;
  actor: string | null;
  actor_user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | string | null;
  summary: string | null;
  ip_address: string | null;
  changes_json: string | null;
}

interface Response {
  entries: Entry[];
  entityTypes: string[];
  actions: string[];
  actors: string[];
}

interface ChainStatus {
  ok: boolean;
  checked: number;
  firstBrokenId: number | null;
  reason: string | null;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// changes_json is { field: { from, to } } for updates, { field: { changed: true } }
// for redacted fields, { deleted: {...row} } for deletes, or free-form extras
// (e.g. { revealed: [...] } on a KYC view, { payment: {...} } on a payment).
function Changes({ json }: { json: string | null }) {
  if (!json) return null;
  let changes: Record<string, unknown>;
  try {
    changes = JSON.parse(json);
  } catch {
    return <code>{json}</code>;
  }
  if (!changes || typeof changes !== "object") return null;
  const entries = Object.entries(changes);
  if (!entries.length) return <span style={{ color: "var(--text-muted)" }}>No field changes</span>;
  if (changes.deleted && typeof changes.deleted === "object") {
    return (
      <details>
        <summary>Deleted record</summary>
        <ul className="audit-changes">
          {Object.entries(changes.deleted as Record<string, unknown>).map(([k, v]) => (
            <li key={k}>
              <strong>{k}</strong>: {show(v)}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  const list = (
    <ul className="audit-changes">
      {entries.map(([field, value]) => {
        const change = value as { from?: unknown; to?: unknown; changed?: boolean } | null;
        if (change && typeof change === "object" && "changed" in change) {
          return (
            <li key={field}>
              <strong>{field}</strong>: changed (value hidden)
            </li>
          );
        }
        if (change && typeof change === "object" && ("from" in change || "to" in change)) {
          return (
            <li key={field}>
              <strong>{field}</strong>: {show(change.from)} → {show(change.to)}
            </li>
          );
        }
        return (
          <li key={field}>
            <strong>{field}</strong>: {show(value)}
          </li>
        );
      })}
    </ul>
  );
  return entries.length > 4 ? (
    <details>
      <summary>{entries.length} fields</summary>
      {list}
    </details>
  ) : (
    list
  );
}

export function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entityType = searchParams.get("entity_type") || "";
  const action = searchParams.get("action") || "";
  const actor = searchParams.get("actor") || "";
  const entityId = searchParams.get("entity_id") || "";

  const query = new URLSearchParams({ entity_type: entityType, action, actor, entity_id: entityId }).toString();
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", query],
    queryFn: () => api.get<Response>(`/api/audit-log?${query}`),
  });
  const chain = useQuery({
    queryKey: ["audit-log", "verify"],
    queryFn: () => api.get<ChainStatus>("/api/audit-log/verify"),
  });

  function setFilter(key: string, value: string) {
    const next = { entity_type: entityType, action, actor, entity_id: entityId, [key]: value };
    setSearchParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  }

  const columns: DataGridColumn<Entry>[] = [
    { key: "when", header: "When (UTC)", render: (e) => e.created_at },
    { key: "actor", header: "Actor", render: (e) => e.actor || "—" },
    { key: "action", header: "Action", render: (e) => <StatusBadge status={e.action} /> },
    { key: "record", header: "Record", render: (e) => `${titleCase(e.entity_type)} #${e.entity_id ?? "—"}` },
    { key: "details", header: "Details", render: (e) => e.summary || "" },
    { key: "changes", header: "Changes", render: (e) => <Changes json={e.changes_json} /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Compliance</p>
          <h1>Audit Log</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Who created, changed, viewed or deleted a sensitive record, and which fields changed. Append-only and admin-only.
          </p>
        </div>
      </div>

      {chain.data &&
        (chain.data.ok ? (
          <div className="flash flash-success">Integrity check passed: all {chain.data.checked} entries are intact and in order.</div>
        ) : (
          <div className="flash flash-error">
            Integrity check FAILED at entry #{chain.data.firstBrokenId}: {chain.data.reason} Entries from that point on may have
            been altered outside the app.
          </div>
        ))}

      <div className="toolbar">
        <select value={entityType} onChange={(e) => setFilter("entity_type", e.target.value)}>
          <option value="">All record types</option>
          {(data?.entityTypes || []).map((t) => (
            <option key={t} value={t}>{titleCase(t)}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setFilter("action", e.target.value)}>
          <option value="">All actions</option>
          {(data?.actions || []).map((a) => (
            <option key={a} value={a}>{titleCase(a)}</option>
          ))}
        </select>
        <select value={actor} onChange={(e) => setFilter("actor", e.target.value)}>
          <option value="">All actors</option>
          {(data?.actors || []).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          placeholder="Record #"
          value={entityId}
          onChange={(e) => setFilter("entity_id", e.target.value.trim())}
          style={{ maxWidth: "8rem" }}
        />
      </div>

      <DataGrid
        columns={columns}
        rows={data?.entries}
        isLoading={isLoading}
        getRowKey={(e) => e.id}
        emptyMessage="No audit entries match."
      />
    </div>
  );
}

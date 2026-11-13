import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { DataGrid } from "@/shared/components/DataGrid";
import type { OrgMeta } from "../lib/orgTypes";

interface Source {
  key: string;
  label: string;
  inHeadline: boolean;
  total: number;
  attributed: number;
  unattributed: number;
  noName: number;
  unmatched: { value: string; count: number }[];
}

interface Report {
  summary: { total: number; unattributed: number; unattributedPct: number; targetPct: number; meetsTarget: boolean };
  sources: Source[];
  claims: {
    total: number;
    attributed: number;
    unattributed: number;
    unassigned: { id: number; claim_no: string; status: string; source: string; created_at: string; client_name: string }[];
  };
  unlinkedProducers: { id: number; name: string; email: string | null; suggested_user_id: number | null }[];
  usersWithoutEmployee: { id: number; username: string; role: string }[];
  employeesWithoutManager: { id: number; staff_no: string; full_name: string; department_name: string }[];
}

// Appraisal KPIs are scored per person, so every slip, submission and claim
// has to point at a real login. This page shows what the automatic backfill
// couldn't match and lets HR map it by hand.
export function AttributionPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["org", "attribution"], queryFn: () => api.get<Report>("/api/org/attribution-report") });
  const meta = useQuery({ queryKey: ["org", "meta"], queryFn: () => api.get<OrgMeta>("/api/org/meta") });
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const users = meta.data?.users || [];

  async function run(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "success", text: success });
      await queryClient.invalidateQueries({ queryKey: ["org"] });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  }

  if (isLoading || !data) return <div className="card">Loading…</div>;
  const s = data.summary;

  return (
    <div>
      <div className="page-header">
        <h1>Record attribution</h1>
        <div className="page-header-actions">
          <Link to="/org/employees" className="btn-secondary btn-sm">Employees</Link>
        </div>
      </div>

      {message && <div className={`flash flash-${message.kind}`}>{message.text}</div>}

      <div className="card">
        <div className="detail-grid">
          <div>
            <div className="k">Records without a person</div>
            <div className="v">
              <span className={`badge ${s.meetsTarget ? "badge-paid" : "badge-unpaid"}`}>{s.unattributedPct}%</span>{" "}
              {s.unattributed} of {s.total}
            </div>
          </div>
          <div>
            <div className="k">Target</div>
            <div className="v">Under {s.targetPct}%</div>
          </div>
          <div>
            <div className="k">Logins with no employee record</div>
            <div className="v">{data.usersWithoutEmployee.length}</div>
          </div>
          <div>
            <div className="k">Current staff with no line manager</div>
            <div className="v">{data.employeesWithoutManager.length}</div>
          </div>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 0 }}>
          Counts prepared broking slips, market submissions and claims: the records appraisal KPIs are scored from.
          Names that match a login exactly were linked automatically.
        </p>
      </div>

      {data.sources.map((source) => (
        <div className="card" key={source.key}>
          <h2>{source.label}</h2>
          <p>
            {source.attributed} of {source.total} linked to a login.
            {source.noName > 0 && ` ${source.noName} have no name recorded at all.`}
          </p>
          <DataGrid
            columns={[
              { key: "value", header: "Name recorded", render: (u) => u.value },
              { key: "count", header: "Records", align: "right", render: (u) => u.count },
              {
                key: "map",
                header: "Link to login",
                render: (u) => (
                  <UserPicker
                    users={users}
                    label={`Link "${u.value}" to a login`}
                    onPick={(userId) =>
                      run(() => api.post("/api/org/attribution/map", { source: source.key, value: u.value, user_id: userId }), `Linked ${u.count} record(s) named "${u.value}".`)
                    }
                  />
                ),
              },
            ]}
            rows={source.unmatched}
            isLoading={false}
            getRowKey={(u) => u.value}
            emptyMessage="Every name here matches a login."
          />
        </div>
      ))}

      <UnassignedClaims claims={data.claims} users={users} run={run} />

      <div className="card">
        <h2>Producers not linked to a login</h2>
        <DataGrid
          columns={[
            { key: "name", header: "Producer", render: (p) => p.name },
            { key: "email", header: "Email", render: (p) => p.email || "—" },
            {
              key: "link",
              header: "Link to login",
              render: (p) => (
                <UserPicker
                  users={users}
                  initial={p.suggested_user_id}
                  label={`Link producer ${p.name} to a login`}
                  onPick={(userId) => run(() => api.put(`/api/org/attribution/producers/${p.id}`, { user_id: userId }), `Linked producer ${p.name}.`)}
                />
              ),
            },
          ]}
          rows={data.unlinkedProducers}
          isLoading={false}
          getRowKey={(p) => p.id}
          emptyMessage="Every active producer is linked to a login."
        />
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          External producers with no ERP login can stay unlinked. They aren't appraised.
        </p>
      </div>

      <div className="card">
        <h2>Logins with no employee record</h2>
        <DataGrid
          columns={[
            { key: "username", header: "Login", render: (u) => u.username },
            { key: "role", header: "Access role", render: (u) => <span className={`badge badge-${u.role}`}>{u.role}</span> },
            { key: "add", header: "", render: (u) => <Link to={`/org/employees/new?user_id=${u.id}`} className="btn-secondary btn-sm">Add employee</Link> },
          ]}
          rows={data.usersWithoutEmployee}
          isLoading={false}
          getRowKey={(u) => u.id}
          emptyMessage="Every login belongs to an employee."
        />
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Agents are listed first: they are appraised, so each needs an employee record. Service or shared
          accounts can be left here.
        </p>
      </div>

      <div className="card">
        <h2>Current staff with no line manager</h2>
        <DataGrid
          columns={[
            { key: "name", header: "Name", render: (e) => <Link to={`/org/employees/${e.id}`}>{e.full_name}</Link> },
            { key: "staff_no", header: "Staff no", render: (e) => e.staff_no },
            { key: "dept", header: "Department", render: (e) => e.department_name },
          ]}
          rows={data.employeesWithoutManager}
          isLoading={false}
          getRowKey={(e) => e.id}
          emptyMessage="Everyone has a line manager."
        />
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Only the MD should be here. The MD's appraisal is reviewed by the Board Chair.
        </p>
      </div>
    </div>
  );
}

function UserPicker({
  users, onPick, label, initial = null,
}: {
  users: OrgMeta["users"];
  onPick: (userId: number) => void;
  label: string;
  initial?: number | null;
}) {
  const [value, setValue] = useState(initial ? String(initial) : "");
  return (
    <span style={{ display: "inline-flex", gap: "0.4rem" }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} aria-label={label}>
        <option value="">Choose login…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.username}{u.employee_name ? ` (${u.employee_name})` : ""}</option>
        ))}
      </select>
      <button type="button" className="btn-secondary btn btn-sm" disabled={!value} onClick={() => onPick(Number(value))}>
        Link
      </button>
    </span>
  );
}

function UnassignedClaims({
  claims, users, run,
}: {
  claims: Report["claims"];
  users: OrgMeta["users"];
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [handler, setHandler] = useState("");
  const allSelected = claims.unassigned.length > 0 && selected.length === claims.unassigned.length;

  async function assign() {
    await run(() => api.post("/api/org/attribution/claims/assign", { claim_ids: selected, user_id: Number(handler) }), `Assigned ${selected.length} claim(s).`);
    setSelected([]);
  }

  return (
    <div className="card">
      <h2>Claims with no handler</h2>
      <p>
        {claims.attributed} of {claims.total} claims have a handler. Claims logged through the customer portal
        start without one.
      </p>
      {claims.unassigned.length > 0 && (
        <div className="toolbar">
          <select value={handler} onChange={(e) => setHandler(e.target.value)} aria-label="Handler for the selected claims">
            <option value="">Choose handler…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" disabled={!handler || !selected.length} onClick={assign}>
            Assign {selected.length || ""} selected
          </button>
        </div>
      )}
      <DataGrid
        columns={[
          {
            key: "pick",
            header: (
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? claims.unassigned.map((c) => c.id) : [])}
              />
            ),
            render: (c) => (
              <input
                type="checkbox"
                aria-label={`Select ${c.claim_no}`}
                checked={selected.includes(c.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
              />
            ),
          },
          { key: "no", header: "Claim", render: (c) => <Link to={`/claims/${c.id}`}>{c.claim_no}</Link> },
          { key: "client", header: "Client", render: (c) => c.client_name },
          { key: "status", header: "Status", render: (c) => c.status },
          { key: "source", header: "Logged via", render: (c) => c.source },
          { key: "date", header: "Logged", render: (c) => c.created_at?.slice(0, 10) },
        ]}
        rows={claims.unassigned}
        isLoading={false}
        getRowKey={(c) => c.id}
        emptyMessage="Every claim has a handler."
      />
    </div>
  );
}

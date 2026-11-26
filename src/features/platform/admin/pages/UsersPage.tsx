import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataGrid, type DataGridColumn } from "@/shared/components/DataGrid";
import { confirmAction } from "@/shared/components/ConfirmDialog";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { ListSearch } from "@/shared/components/ListSearch";
import { useRowSearch } from "@/shared/hooks/useRowSearch";

type Role = "admin" | "editor" | "viewer" | "agent";

interface UserRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  // "First Last" (the email for an account with no name yet).
  name: string;
  // The sign-in. Accounts made before names existed may have none until an admin sets it.
  email: string | null;
  role: Role;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  managed_clients: number;
  // Two-factor sign-in is switched on for this login.
  mfa_enabled: boolean;
}

interface MfaPolicy {
  admins: boolean;
  finance: boolean;
  compliance: boolean;
  everyone: boolean;
}

const POLICY_OPTIONS: { key: keyof MfaPolicy; label: string; help: string }[] = [
  { key: "admins", label: "Administrators", help: "Everyone with the admin access role." },
  { key: "finance", label: "Finance users", help: "Anyone holding a General Ledger role (finance director, accountant, auditor)." },
  { key: "compliance", label: "Compliance users", help: "Anyone holding the compliance or MD appraisal role." },
  { key: "everyone", label: "Everyone", help: "Every staff login, including agents." },
];

// Who must use two-factor sign-in. A person it covers who hasn't set it up is taken through setup at their next
// sign-in (or straight away if already signed in), and can't switch it off. Saved and audited by the server.
function MfaPolicyCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["users", "mfa-policy"], queryFn: () => api.get<{ policy: MfaPolicy }>("/api/users/mfa-policy") });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function toggle(key: keyof MfaPolicy, value: boolean) {
    setError(null);
    setSaving(true);
    try {
      const res = await api.post<{ policy: MfaPolicy }>("/api/users/mfa-policy", { [key]: value });
      queryClient.setQueryData(["users", "mfa-policy"], res);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the setting.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="card">
      <h2>Two-factor sign-in</h2>
      <p className="text-muted">
        Require a code from an authenticator app, as well as the password, for these people. Each person sets it up on
        their Account page, or is taken through setup when they next sign in.
      </p>
      {error && <div className="flash flash-error">{error}</div>}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.75rem 1.5rem" }}>
          {POLICY_OPTIONS.map((o) => (
            <label key={o.key} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontWeight: 400 }}>
              <input type="checkbox" style={{ width: "auto", marginTop: "0.2rem" }} checked={data.policy[o.key]} disabled={saving} onChange={(e) => toggle(o.key, e.target.checked)} />
              <span><strong>{o.label}</strong><br /><small className="text-muted">{o.help}</small></span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface BranchOption {
  id: number;
  name: string;
  is_active: number;
}

const ROLES: Role[] = ["admin", "editor", "viewer", "agent"];

const ROLE_HELP: Record<Role, string> = {
  admin: "Full access, plus users, branches and the audit log.",
  editor: "Full read/write access to all records.",
  viewer: "Read-only access to all records.",
  agent: "Read-only, and only for clients they are account manager of (their policies, renewals and claims).",
};

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: UserRow[]; branches: BranchOption[] }>("/api/users"),
  });
  const search = useRowSearch(data?.users, (u) => [u.name, u.email, u.role, u.branch_name]);
  const activeBranches = (data?.branches ?? []).filter((b) => b.is_active);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [branchId, setBranchId] = useState("");
  const [email, setEmail] = useState("");
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refetchUsers() {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/users", { first_name: firstName, last_name: lastName, email, password, confirm, role, branch_id: branchId || null });
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      setConfirm("");
      setRole("editor");
      setBranchId("");
      await refetchUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(userId: number, newRole: string) {
    try {
      await api.post(`/api/users/${userId}/role`, { role: newRole });
      await refetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change role.");
    }
  }

  async function handleBranchChange(userId: number, newBranchId: string) {
    try {
      await api.post(`/api/users/${userId}/branch`, { branch_id: newBranchId || null });
      await refetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change branch.");
    }
  }

  async function handleNameChange(userRow: UserRow, field: "first_name" | "last_name", value: string) {
    const next = value.trim();
    if (next === (userRow[field] ?? "")) return;
    setError(null);
    // Read the other half from its box, not the saved row: an account with no name yet is named by
    // typing both boxes, and the first one is only saved once the second is filled in.
    const otherField = field === "first_name" ? "last_name" : "first_name";
    const otherBox = document.getElementById(`user-${userRow.id}-${otherField}`) as HTMLInputElement | null;
    const other = (otherBox?.value ?? userRow[otherField] ?? "").trim();
    const first = field === "first_name" ? next : other;
    const last = field === "last_name" ? next : other;
    if (!first || !last) {
      // Wait until both halves are filled in before saving an account that had no name.
      if (next) return;
      setError("First name and last name are both required.");
      await refetchUsers();
      return;
    }
    try {
      await api.post(`/api/users/${userRow.id}/name`, { first_name: first, last_name: last });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the name.");
    }
    await refetchUsers();
  }

  async function handleEmailChange(userRow: UserRow, value: string) {
    if (value.trim() === (userRow.email ?? "")) return;
    if (!value.trim()) {
      setError("The email address is how this person signs in, so it can't be removed.");
      await refetchUsers();
      return;
    }
    setError(null);
    try {
      await api.post(`/api/users/${userRow.id}/email`, { email: value });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change email.");
    }
    await refetchUsers();
  }

  async function handleSendLink(userRow: UserRow) {
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/users/${userRow.id}/reset-link`);
      setNotice(`A reset link was emailed to ${userRow.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the reset link.");
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    if (!pwUser) return;
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/users/${pwUser.id}/password`, { password: pw, confirm: pwConfirm });
      setNotice(`Password changed for ${pwUser.name}. They have been signed out everywhere.`);
      setPwUser(null);
      setPw("");
      setPwConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password.");
    }
  }

  async function handleMfaReset(userRow: UserRow) {
    if (!confirmAction(`Reset two-factor sign-in for ${userRow.name}? Use this when they have lost their phone. They set it up again when they next sign in.`)) return;
    setError(null);
    setNotice(null);
    try {
      await api.post(`/api/users/${userRow.id}/mfa-reset`);
      setNotice(`Two-factor sign-in was reset for ${userRow.name}.`);
      await refetchUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset two-factor sign-in.");
    }
  }

  async function handleDelete(userRow: UserRow) {
    if (!confirmAction(`Delete user "${userRow.name}"?`)) return;
    try {
      await api.post(`/api/users/${userRow.id}/delete`);
      await refetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete user.");
    }
  }

  const columns: DataGridColumn<UserRow>[] = [
    {
      key: "first_name",
      header: "First name",
      render: (u) => (
        <input
          id={`user-${u.id}-first_name`}
          key={`${u.id}-first-${u.first_name ?? ""}`}
          defaultValue={u.first_name ?? ""}
          maxLength={100}
          placeholder="—"
          aria-label={`First name of ${u.name}`}
          onBlur={(e) => handleNameChange(u, "first_name", e.target.value)}
        />
      ),
    },
    {
      key: "last_name",
      header: "Last name",
      render: (u) => (
        <input
          id={`user-${u.id}-last_name`}
          key={`${u.id}-last-${u.last_name ?? ""}`}
          defaultValue={u.last_name ?? ""}
          maxLength={100}
          placeholder="—"
          aria-label={`Last name of ${u.name}`}
          onBlur={(e) => handleNameChange(u, "last_name", e.target.value)}
        />
      ),
    },
    {
      key: "email",
      header: "Email (sign-in)",
      render: (u) => (
        <input
          type="email"
          key={`${u.id}-${u.email ?? ""}`}
          defaultValue={u.email ?? ""}
          placeholder="none: can't sign in"
          aria-label={`Email for ${u.name}`}
          onBlur={(e) => handleEmailChange(u, e.target.value)}
        />
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <>
          <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)} title={ROLE_HELP[u.role]}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <StatusBadge status={u.role} />
        </>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      render: (u) => (
        <select value={u.branch_id ?? ""} onChange={(e) => handleBranchChange(u.id, e.target.value)}>
          <option value="">—</option>
          {(data?.branches ?? [])
            .filter((b) => b.is_active || b.id === u.branch_id)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      ),
    },
    {
      key: "clients",
      header: "Clients managed",
      render: (u) => (u.role === "agent" && u.managed_clients === 0 ? <span title="This agent can't see any clients yet">0 ⚠</span> : u.managed_clients),
    },
    {
      key: "mfa",
      header: "Two-factor",
      render: (u) => (u.mfa_enabled ? <span className="badge badge-paid">On</span> : <span className="badge badge-secondary">Off</span>),
    },
    { key: "created", header: "Created", render: (u) => u.created_at },
    {
      key: "actions",
      header: "",
      render: (u) => (
        <div className="actions-row">
          <button type="button" className="btn-secondary btn-sm" disabled={!u.email} title={u.email ? "Email a one-hour reset link" : "Add an email address first"} onClick={() => handleSendLink(u)}>
            Send reset link
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setPwUser(u)}>
            Set password
          </button>
          {u.mfa_enabled && u.id !== me?.id && (
            <button type="button" className="btn-secondary btn-sm" title="They have lost their phone: they set it up again at next sign-in" onClick={() => handleMfaReset(u)}>
              Reset two-factor
            </button>
          )}
          {u.id !== me?.id && (
            <button type="button" className="btn-danger btn btn-sm" onClick={() => handleDelete(u)}>
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <div className="page-header-actions">
          <Link to="/branches" className="btn-secondary btn-sm">Branches</Link>
          <Link to="/audit-log" className="btn-secondary btn-sm">View audit log</Link>
        </div>
      </div>

      {notice && <div className="flash flash-success">{notice}</div>}
      {error && <div className="flash flash-error">{error}</div>}

      {pwUser && (
        <div className="card">
          <h2>Set password for {pwUser.name}</h2>
          <form onSubmit={handleSetPassword} className="form-grid">
            <div className="field">
              <label htmlFor="set-password">New password</label>
              <input id="set-password" type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="set-confirm">Confirm password</label>
              <input id="set-confirm" type="password" minLength={8} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
            </div>
            <div className="field" style={{ justifyContent: "flex-end", flexDirection: "row", gap: "0.5rem" }}>
              <button type="submit" className="btn">Change password</button>
              <button type="button" className="btn-secondary btn" onClick={() => setPwUser(null)}>Cancel</button>
            </div>
          </form>
          <p>They are signed out of every device when the password changes.</p>
        </div>
      )}

      <div className="card">
        <h2>Add user</h2>
        <form onSubmit={handleCreate} className="form-grid">
          <div className="field">
            <label htmlFor="new-first-name">First name</label>
            <input id="new-first-name" value={firstName} maxLength={100} autoComplete="off" onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-last-name">Last name</label>
            <input id="new-last-name" value={lastName} maxLength={100} autoComplete="off" onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-email">Email (they sign in with this)</label>
            <input id="new-email" type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-password">Password</label>
            <input id="new-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-confirm">Confirm password</label>
            <input id="new-confirm" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-role">Role</label>
            <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <small>{ROLE_HELP[role]}</small>
          </div>
          <div className="field">
            <label htmlFor="new-branch">Branch</label>
            <select id="new-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">—</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <small className="text-muted">An editor or viewer with a branch sees only that branch's clients, policies, claims and receipts. Leave blank to see everything.</small>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Adding…" : "Add user"}
            </button>
          </div>
        </form>
        {role === "agent" && (
          <p>
            A new agent sees nothing until they are set as <strong>account manager</strong> on clients (edit a client to assign
            one).
          </p>
        )}
      </div>

      <MfaPolicyCard />

      <div className="card">
        <h2>All users</h2>
      </div>
      <ListSearch value={search.query} onChange={search.setQuery} placeholder="Name, email, role or branch…" shown={search.shown} total={search.total} />
      <DataGrid
        columns={columns}
        rows={search.filtered}
        isLoading={isLoading}
        getRowKey={(u) => u.id}
        emptyMessage="No users found."
      />
    </div>
  );
}

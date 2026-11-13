import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { pb, usePbAccess } from "../api/policyBank";
import { Flash, PbLayout, useAct } from "../components/PbCommon";

const SOURCE_LABEL: Record<string, string> = { insurer_approved: "Insurer-approved wording", insurer_specific: "Insurer-specific wording", broker_master: "Broker master (specimen) wording" };

interface Role { code: string; name: string; description: string | null; permissions: string[] }
interface UserRow { id: number; username: string; role: string; pbRoles: string[] }

function Precedence() {
  const { can } = usePbAccess();
  const q = useQuery({ queryKey: ["pb", "precedence"], queryFn: () => pb.get<{ precedence: string[] }>("/settings/precedence") });
  const [edited, setOrder] = useState<string[] | null>(null);
  const order = edited ?? q.data?.precedence ?? [];
  const save = useAct(() => pb.put("/settings/precedence", { precedence: order }), () => "Precedence saved.");
  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const editable = can("policy_bank.approve");
  return (
    <div className="card">
      <h2 className="card-title">Which wording wins</h2>
      <p className="pb-muted">When more than one approved wording could apply to a component for an insurer, the source highest in this list is used. Insurer wording is only ever considered for that insurer.</p>
      <Flash error={save.error} ok={save.ok} />
      <ol className="pb-order" style={{ padding: 0 }}>
        {order.map((s, i) => (
          <li key={s}>
            <span>{i + 1}. {SOURCE_LABEL[s] ?? s}</span>
            {editable && (
              <span className="pb-row-actions">
                <button type="button" className="btn-secondary btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn-secondary btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {editable ? <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save order</button> : <p className="pb-muted">Changing this needs the approve permission.</p>}
    </div>
  );
}

function Vat() {
  const { can } = usePbAccess();
  const q = useQuery({ queryKey: ["pb", "vat"], queryFn: () => pb.get<{ vatRate: number }>("/settings/vat-rate") });
  const [edited, setEdited] = useState<string | null>(null);
  const value = edited ?? String(q.data?.vatRate ?? "");
  const save = useAct(() => pb.put("/settings/vat-rate", { vatRate: value }), () => { setEdited(null); return "VAT rate saved."; });
  return (
    <div className="card">
      <h2 className="card-title">VAT rate</h2>
      <p className="pb-muted">Used for the VAT and gross premium on a policy schedule. The ERP does not store VAT, so it is worked out from the net premium.</p>
      <Flash error={save.error} ok={save.ok} />
      <input type="number" step="0.1" className="form-control" style={{ width: "8rem", display: "inline-block" }} value={value} disabled={!can("policy_bank.approve")} onChange={(e) => setEdited(e.target.value)} /> %
      {can("policy_bank.approve") && <button type="button" className="btn" style={{ marginLeft: "0.8rem" }} disabled={save.isPending || edited === null} onClick={() => save.mutate(undefined)}>Save</button>}
    </div>
  );
}

function Roles() {
  const roles = useQuery({ queryKey: ["pb", "roles"], queryFn: () => pb.get<{ roles: Role[]; permissions: string[] }>("/roles") });
  const users = useQuery({ queryKey: ["pb", "users"], queryFn: () => pb.get<{ users: UserRow[] }>("/users") });
  const set = useAct((a: { id: number; roles: string[] }) => pb.put(`/users/${a.id}/roles`, { roles: a.roles }), () => "Roles saved.");
  return (
    <div className="card pb-table-wrap">
      <h2 className="card-title">Who can do what</h2>
      <Flash error={set.error ?? users.error} ok={set.ok} />
      <table>
        <thead><tr><th>Role</th><th>Can</th></tr></thead>
        <tbody>
          {(roles.data?.roles ?? []).map((r) => (
            <tr key={r.code}><td><strong>{r.name}</strong><div className="pb-muted" style={{ fontSize: "0.78rem" }}>{r.description}</div></td><td className="pb-code">{r.permissions.join(", ")}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="pb-muted">Administrators hold every permission. Agents never hold any.</p>
      <table style={{ marginTop: "1rem" }}>
        <thead><tr><th>User</th><th>Login role</th>{(roles.data?.roles ?? []).map((r) => <th key={r.code}>{r.name}</th>)}</tr></thead>
        <tbody>
          {(users.data?.users ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.role}</td>
              {(roles.data?.roles ?? []).map((r) => (
                <td key={r.code}>
                  {u.role === "admin" ? <span className="pb-muted">all</span> : (
                    <input
                      type="checkbox"
                      checked={u.pbRoles.includes(r.code)}
                      disabled={set.isPending}
                      onChange={(e) => set.mutate({ id: u.id, roles: e.target.checked ? [...u.pbRoles, r.code] : u.pbRoles.filter((x) => x !== r.code) })}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PbSettingsPage() {
  const { user } = useAuth();
  return (
    <PbLayout title="Settings" intro="Wording precedence and who may use the Policy Bank.">
      <Precedence />
      <Vat />
      {user?.isAdmin ? <Roles /> : <div className="card pb-muted">Only an administrator can change who holds Policy Bank roles.</div>}
    </PbLayout>
  );
}

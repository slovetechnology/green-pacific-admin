import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/shared/api/client";
import { confirmAction } from "@/shared/components/ConfirmDialog";

interface Member {
  id: number;
  team_group_id: number;
  full_name: string;
  job_title: string | null;
  bio: string | null;
  photo_url: string | null;
  is_published: number;
  position: number;
}
interface Group {
  id: number;
  name: string;
  member_count: number;
  members: Member[];
}
interface Pagination {
  page: number;
  total: number;
  total_pages: number;
  has_next_page: boolean;
  has_prev_page: boolean;
}

const PAGE_SIZE = 20;
const EMPTY = { full_name: "", job_title: "", bio: "", photo_url: "" };

// Admin-only (backend platform/team). Groups and people shown on the public "Our Team" page (GET /api/team).
export function TeamPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["team-admin", page],
    queryFn: () => api.get<{ groups: Group[]; pagination: Pagination }>(`/api/team-admin?page=${page}&limit=${PAGE_SIZE}`),
  });
  const pagination = data?.pagination;
  const lastPage = Math.max(1, pagination?.total_pages ?? 1);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);
  const [groupName, setGroupName] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<{ groupId: number; memberId: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = data?.groups ?? [];

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["team-admin"] });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addGroup(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.post("/api/team-admin/groups", { name: groupName }), "Could not add the group.")) setGroupName("");
  }

  function renameGroup(g: Group) {
    const name = window.prompt("Group name", g.name);
    if (name === null) return;
    void run(() => api.put(`/api/team-admin/groups/${g.id}`, { name }), "Could not rename the group.");
  }

  function deleteGroup(g: Group) {
    if (!confirmAction(`Delete the group "${g.name}"?`)) return;
    void run(() => api.delete(`/api/team-admin/groups/${g.id}`), "Could not delete the group.");
  }

  function startEdit(groupId: number, m: Member | null) {
    setError(null);
    setEditing({ groupId, memberId: m?.id ?? null });
    setForm(m ? { full_name: m.full_name, job_title: m.job_title ?? "", bio: m.bio ?? "", photo_url: m.photo_url ?? "" } : { ...EMPTY });
  }

  async function saveMember(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const ok = await run(
      () =>
        editing.memberId
          ? api.put(`/api/team-admin/members/${editing.memberId}`, form)
          : api.post("/api/team-admin/members", { ...form, team_group_id: editing.groupId }),
      "Could not save the person.",
    );
    if (ok) setEditing(null);
  }

  function togglePublished(m: Member) {
    void run(() => api.put(`/api/team-admin/members/${m.id}`, { is_published: m.is_published ? 0 : 1 }), "Could not save the change.");
  }

  function deleteMember(m: Member) {
    if (!confirmAction(`Remove ${m.full_name} from the team?`)) return;
    void run(() => api.delete(`/api/team-admin/members/${m.id}`), "Could not remove the person.");
  }

  const move = (kind: "groups" | "members", id: number, direction: "up" | "down") =>
    void run(() => api.post(`/api/team-admin/${kind}/${id}/move`, { direction }), "Could not move it.");

  return (
    <div>
      <div className="page-header">
        <h1>Our Team</h1>
      </div>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="card">
        <h2>Add a group</h2>
        <form onSubmit={addGroup} className="form-grid">
          <div className="field">
            <label htmlFor="tg-name">Group name</label>
            <input id="tg-name" value={groupName} maxLength={120} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Advisory Board" required />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn" disabled={busy}>Add group</button>
          </div>
        </form>
        <p>Groups and people appear on the public About Us page in this order. Unpublished people, and groups with nobody published, are hidden.</p>
      </div>

      {isLoading && <p>Loading…</p>}

      {groups.map((g, gi) => (
        <div className="card" key={g.id}>
          <h2>{g.name}</h2>
          <p>
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy || gi === 0} onClick={() => move("groups", g.id, "up")} aria-label={`Move ${g.name} up`}>↑</button>{" "}
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy || gi === groups.length - 1} onClick={() => move("groups", g.id, "down")} aria-label={`Move ${g.name} down`}>↓</button>{" "}
            <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => renameGroup(g)}>Rename</button>{" "}
            {g.member_count === 0 && (
              <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => deleteGroup(g)}>Delete group</button>
            )}{" "}
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => startEdit(g.id, null)}>Add person</button>
          </p>

          {editing?.groupId === g.id && (
            <form onSubmit={saveMember} className="form-grid">
              <div className="field">
                <label htmlFor="tm-name">Full name</label>
                <input id="tm-name" value={form.full_name} maxLength={150} required onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tm-role">Role</label>
                <input id="tm-role" value={form.job_title} maxLength={150} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tm-photo">Photo link</label>
                <input id="tm-photo" type="url" value={form.photo_url} maxLength={500} placeholder="https://…" onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tm-bio">Bio</label>
                <textarea id="tm-bio" rows={4} value={form.bio} maxLength={5000} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </div>
              <div className="field" style={{ justifyContent: "flex-end" }}>
                <button type="submit" className="btn" disabled={busy}>{editing.memberId ? "Save" : "Add person"}</button>{" "}
                <button type="button" className="btn-secondary btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          )}

          {g.member_count === 0 ? (
            <p className="muted">Nobody in this group yet.</p>
          ) : g.members.length === 0 ? (
            <p className="muted">{g.member_count} in this group, on other pages.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Order</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {g.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button type="button" className="btn-secondary btn btn-sm"                       disabled={busy || m.position === 1} onClick={() => move("members", m.id, "up")} aria-label={`Move ${m.full_name} up`}>↑</button>{" "}
                                            <button type="button" className="btn-secondary btn btn-sm" disabled={busy || m.position === g.member_count} onClick={() => move("members", m.id, "down")} aria-label={`Move ${m.full_name} down`}>↓</button>
                    </td>
                    <td>{m.is_published ? m.full_name : <span className="muted">{m.full_name}</span>}</td>
                    <td>{m.job_title || "—"}</td>
                    <td>{m.is_published ? "Published" : "Hidden"}</td>
                    <td>
                      <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => startEdit(g.id, m)}>Edit</button>{" "}
                      <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => togglePublished(m)}>{m.is_published ? "Hide" : "Publish"}</button>{" "}
                      <button type="button" className="btn-secondary btn btn-sm" disabled={busy} onClick={() => deleteMember(m)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {pagination && pagination.total_pages > 1 && (
        <p>
          <button type="button" className="btn-secondary btn btn-sm" disabled={!pagination.has_prev_page} onClick={() => setPage(page - 1)}>Previous</button>{" "}
          Page {Math.min(page, lastPage)} of {lastPage} ({pagination.total} people){" "}
          <button type="button" className="btn-secondary btn btn-sm" disabled={!pagination.has_next_page} onClick={() => setPage(page + 1)}>Next</button>
        </p>
      )}
    </div>
  );
}

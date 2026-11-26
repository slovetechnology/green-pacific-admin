import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { useAuth } from "@/features/platform/auth/AuthContext";
import { ThreadList } from "../components/ThreadList";
import type { ThreadSummary } from "../messageTypes";

const BOXES = [
  { id: "unanswered", label: "Awaiting reply" },
  { id: "mine", label: "Mine" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
] as const;

interface ListResponse {
  threads: ThreadSummary[];
  total: number;
  totalPages: number;
  page: number;
  counts: { unanswered: number; mine: number; unread: number };
}

/** Inbox > Client Messages: every conversation with clients, awaiting reply first. */
export function ClientMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const box = searchParams.get("box") || "unanswered";
  const q = searchParams.get("q") || "";
  const page = Number(searchParams.get("page")) || 1;
  const [search, setSearch] = useState(q);
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["client-messages", box, q, page],
    queryFn: () => api.get<ListResponse>(`/api/client-messages?box=${box}&q=${encodeURIComponent(q)}&page=${page}`),
  });

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: search.trim() });
  }

  const countFor = (id: string) => (id === "unanswered" ? data?.counts.unanswered : id === "mine" ? data?.counts.mine : undefined);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Client Messages</h1>
          <p style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
            Conversations with clients by email, plus copies of the receipts, renewal notices and quote acknowledgements emailed to them.
          </p>
        </div>
        <RoleGate need="write">
          <div className="page-header-actions">
            {user?.isAdmin && <Link className="btn-secondary btn" to="/client-messages/email-setup">Email replies setup</Link>}
            <Link className="btn" to="/client-messages/new">New message</Link>
          </div>
        </RoleGate>
      </div>

      <div className="msg-boxes" role="tablist" aria-label="Message folders">
        {BOXES.map((b) => {
          const n = countFor(b.id);
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={b.id === box}
              className={b.id === box ? "btn btn-sm" : "btn-secondary btn btn-sm"}
              onClick={() => update({ box: b.id === "unanswered" ? "" : b.id })}
            >
              {b.label}
              {n ? <span className="msg-count">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <form className="msg-toolbar" onSubmit={onSearch} role="search">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by subject or client" aria-label="Search messages" />
        <button type="submit" className="btn-secondary btn btn-sm">Search</button>
        {q && <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setSearch(""); update({ q: "" }); }}>Clear</button>}
      </form>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ThreadList
          threads={data?.threads ?? []}
          linkTo={(t) => `/client-messages/${t.id}`}
          unreadOf={(t) => t.staff_unread ?? 0}
          showClient
          showStaffState
          emptyMessage={box === "unanswered" ? "Nothing is waiting for a reply." : box === "mine" ? "No open conversations are assigned to you." : "No conversations found."}
        />
      )}

      {data && data.totalPages > 1 && (
        <div className="msg-toolbar" style={{ marginTop: "0.9rem", justifyContent: "center" }}>
          <button type="button" className="btn-secondary btn btn-sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}>Previous</button>
          <span>Page {data.page} of {data.totalPages}</span>
          <button type="button" className="btn-secondary btn btn-sm" disabled={data.page >= data.totalPages} onClick={() => update({ page: String(data.page + 1) })}>Next</button>
        </div>
      )}
    </div>
  );
}

import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { RoleGate } from "@/app/guards/RoleGate";
import { ThreadList } from "./ThreadList";
import type { ThreadSummary } from "../messageTypes";

/** The client page's Messages tab: every conversation with this client, newest first. */
export function ClientCorrespondence({ clientId }: { clientId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-messages", "client", clientId],
    queryFn: () => api.get<{ threads: ThreadSummary[]; total: number }>(`/api/client-messages?box=all&client_id=${clientId}`),
  });
  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Correspondence</h2>
        <RoleGate need="write">
          <Link className="btn btn-sm" to={`/client-messages/new?client_id=${clientId}`}>New message</Link>
        </RoleGate>
      </div>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ThreadList
          threads={data?.threads ?? []}
          linkTo={(t) => `/client-messages/${t.id}`}
          unreadOf={(t) => t.staff_unread ?? 0}
          showStaffState
          emptyMessage="No messages with this client yet."
        />
      )}
      {data && data.total > (data.threads?.length ?? 0) && (
        <p className="msg-help">Showing the latest {data.threads.length} of {data.total}. Search for this client in Client Messages to see older ones.</p>
      )}
    </div>
  );
}

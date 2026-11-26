import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuth } from "@/features/platform/auth/AuthContext";

interface NewsItem {
  id: number;
  title: string;
  link: string;
  summary: string;
  source: string;
  stream: string;
  published_at: string | null;
}
interface NewsResponse {
  grouped: Record<string, NewsItem[]>;
  streamColors: Record<string, string>;
  lastFetched: string | null;
  refreshMinutes: number;
}

export function NewsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => api.get<NewsResponse>("/api/news"),
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; inserted: number }>("/api/news/refresh"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news"] }),
  });

  const grouped = data?.grouped ?? {};
  const streams = Object.entries(grouped);

  return (
    <div>
      <div className="page-header">
        <h1>Insurance Industry News</h1>
        {user?.isAdmin && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending ? "Refreshing…" : "Refresh now"}
          </button>
        )}
      </div>
      <p className="period-note">
        Worldwide insurance headlines pulled from Insurance Journal and Artemis (plus NewsAPI, if configured),
        refreshed automatically every {data?.refreshMinutes ?? 90} minutes and grouped by stream below.{" "}
        {data?.lastFetched
          ? `Last refreshed ${data.lastFetched.slice(0, 16)} UTC.`
          : "Not fetched yet — check back after the next refresh cycle."}
      </p>

      {isLoading && <p>Loading…</p>}

      {!isLoading && streams.length > 0 && (
        <>
          <div className="faq-jump" role="navigation" aria-label="Jump to stream">
            {streams.map(([stream, items]) => (
              <a key={stream} href={`#news-${stream}`} className="faq-jump-link">
                {stream}
                <span className="n">{items.length}</span>
              </a>
            ))}
          </div>

          {streams.map(([stream, items]) => (
            <div className="card" id={`news-${stream}`} style={{ marginTop: "1.25rem" }} key={stream}>
              <h2>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: data?.streamColors[stream] || "var(--text-muted)",
                    marginRight: "0.5rem",
                  }}
                />
                {stream}
              </h2>
              <div className="faq-list">
                {items.map((item) => (
                  <div key={item.id} className="faq-item" style={{ padding: "0.6rem 0", borderBottom: "1px solid var(--gridline)" }}>
                    <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                      {item.title}
                    </a>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                      {item.source}
                      {item.published_at && ` · ${item.published_at.slice(0, 16)}`}
                    </div>
                    {item.summary && <p style={{ margin: "0.35rem 0 0" }}>{item.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {!isLoading && streams.length === 0 && (
        <div className="card">
          <p className="empty-state">
            No news cached yet — check back after the next refresh cycle{user?.isAdmin ? ', or use "Refresh now" above' : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

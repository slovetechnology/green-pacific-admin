import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { ThreadList } from "@/features/clients/messages/components/ThreadList";
import { MessageComposer } from "@/features/clients/messages/components/MessageComposer";
import type { AttachmentRules, LinkOptions, ThreadSummary } from "@/features/clients/messages/messageTypes";

const BOXES = [
  { id: "all", label: "All" },
  { id: "inbox", label: "Inbox", hint: "Messages from your broker" },
  { id: "sent", label: "Sent", hint: "Messages you sent" },
] as const;
type Box = (typeof BOXES)[number]["id"];

interface ComposeOptions extends LinkOptions {
  topics: string[];
  attachmentRules: AttachmentRules;
}

export function PortalMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const box = (BOXES.some((b) => b.id === searchParams.get("box")) ? searchParams.get("box") : "all") as Box;
  const composing = searchParams.get("new") === "1";

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "messages"],
    queryFn: () => api.get<{ threads: ThreadSummary[]; unread: number }>("/api/portal/messages"),
  });
  const threads = data?.threads ?? [];
  const shown = threads.filter((t) => (box === "inbox" ? (t.received ?? 0) > 0 : box === "sent" ? (t.sent ?? 0) > 0 : true));
  const unreadIn = threads.filter((t) => (t.client_unread ?? 0) > 0).length;

  function go(next: { box?: Box; compose?: boolean }) {
    const params = new URLSearchParams();
    const b = next.box ?? box;
    if (b !== "all") params.set("box", b);
    if (next.compose) params.set("new", "1");
    setSearchParams(params);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>Messages</h1>
          <p className="page-intro" style={{ color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
            Write to your broker and keep every reply, document and email we send you in one place.
          </p>
        </div>
        {!composing && (
          <div className="page-header-actions">
            <button type="button" className="btn" onClick={() => go({ compose: true })}>New message</button>
          </div>
        )}
      </div>

      {composing && (
        <NewMessageCard
          onCancel={() => go({ compose: false })}
          onSent={async (threadId) => {
            await queryClient.invalidateQueries({ queryKey: ["portal", "messages"] });
            await queryClient.invalidateQueries({ queryKey: ["portal", "messages-unread"] });
            navigate(`/portal/messages/${threadId}?sent=1`);
          }}
        />
      )}

      <div className="msg-boxes" role="tablist" aria-label="Message folders">
        {BOXES.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={b.id === box}
            title={"hint" in b ? b.hint : undefined}
            className={b.id === box ? "btn btn-sm" : "btn-secondary btn btn-sm"}
            onClick={() => go({ box: b.id, compose: composing })}
          >
            {b.label}
            {b.id === "inbox" && unreadIn > 0 && <span className="msg-count">{unreadIn}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ThreadList
          threads={shown}
          linkTo={(t) => `/portal/messages/${t.id}`}
          unreadOf={(t) => t.client_unread ?? 0}
          emptyMessage={
            box === "sent" ? "You haven't sent any messages yet." : box === "inbox" ? "Nothing from your broker yet." : "No messages yet. Use New message to write to your broker."
          }
        />
      )}
      <p className="msg-help" style={{ marginTop: "0.75rem" }}>
        Prefer to talk? Call us or see <Link to="/portal/account">My Details</Link> for your account officer.
      </p>
    </div>
  );
}

function NewMessageCard({ onCancel, onSent }: { onCancel: () => void; onSent: (threadId: number) => Promise<void> }) {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [link, setLink] = useState("");
  const { data } = useQuery({
    queryKey: ["portal", "messages", "compose-options"],
    queryFn: () => api.get<ComposeOptions>("/api/portal/messages/compose-options"),
  });

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>New message</h2>
        <button type="button" className="btn-secondary btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      <MessageComposer
        rules={data?.attachmentRules}
        submitLabel="Send message"
        placeholder="How can we help?"
        extraFields={(form) => {
          if (!subject.trim()) return "Please enter a subject.";
          form.append("subject", subject.trim());
          form.append("topic", topic || "Other");
          if (link.startsWith("p:")) form.append("transaction_id", link.slice(2));
          if (link.startsWith("c:")) form.append("claim_id", link.slice(2));
          return null;
        }}
        onSend={async (form) => {
          const res = await api.upload<{ threadId: number }>("/api/portal/messages", form);
          await onSent(res.threadId);
        }}
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="msg-subject">Subject</label>
            <input id="msg-subject" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="msg-topic">What is it about?</label>
            <select id="msg-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Choose…</option>
              {(data?.topics ?? []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="msg-link">Policy or claim (optional)</label>
            <select id="msg-link" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">None</option>
              {(data?.policies ?? []).length > 0 && (
                <optgroup label="Policies">
                  {data!.policies.map((p) => (
                    <option key={`p${p.id}`} value={`p:${p.id}`}>
                      {[p.class_of_business, p.policy_no].filter(Boolean).join(" · ") || `Policy ${p.id}`}
                    </option>
                  ))}
                </optgroup>
              )}
              {(data?.claims ?? []).length > 0 && (
                <optgroup label="Claims">
                  {data!.claims.map((c) => (
                    <option key={`c${c.id}`} value={`c:${c.id}`}>{c.claim_no}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </MessageComposer>
    </div>
  );
}

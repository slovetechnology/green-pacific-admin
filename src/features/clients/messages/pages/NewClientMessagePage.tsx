import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { MessageComposer } from "../components/MessageComposer";
import type { AttachmentRules, LinkOptions } from "../messageTypes";

interface ComposeOptions extends LinkOptions {
  client: { id: number; name: string } | null;
  topics: string[];
  attachmentRules: AttachmentRules;
  suggestions: { name: string; email: string }[];
  defaultTo: string;
}

/** Staff start a conversation with a client (from the inbox or the client's page). */
export function NewClientMessagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clientId = Number(searchParams.get("client_id")) || 0;
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [link, setLink] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const clients = useQuery({
    queryKey: ["clients", "options"],
    queryFn: () => api.get<{ clients: { id: number; name: string }[] }>("/api/clients/options"),
    enabled: !clientId,
  }).data?.clients ?? [];
  const { data } = useQuery({
    queryKey: ["client-messages", "compose-options", clientId],
    queryFn: () => api.get<ComposeOptions>(`/api/client-messages/compose-options?client_id=${clientId}`),
  });

  function pickClient(name: string) {
    setClientSearch(name);
    const match = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (match) setSearchParams({ client_id: String(match.id) });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link to="/client-messages">Client Messages</Link></p>
          <h1>New message</h1>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "48rem" }}>
        {!clientId || !data?.client ? (
          <div className="field">
            <label htmlFor="msg-client">Client</label>
            <input
              id="msg-client"
              list="msg-client-options"
              value={clientSearch}
              onChange={(e) => pickClient(e.target.value)}
              placeholder="Start typing the client's name"
              autoComplete="off"
            />
            <datalist id="msg-client-options">
              {clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <small className="msg-help">Choose the client first. Their policies, claims and email addresses then appear below.</small>
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 0.8rem" }}>
              To <Link to={`/clients/${data.client.id}`}><strong>{data.client.name}</strong></Link>{" "}
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setSearchParams({}); setClientSearch(""); setLink(""); }}>
                Change
              </button>
            </p>
            <MessageComposer
              key={data.client.id}
              staff
              defaultEmailTo={data.defaultTo}
              emailSuggestions={data.suggestions}
              rules={data.attachmentRules}
              submitLabel="Send message"
              placeholder="Write to the client…"
              extraFields={(form) => {
                if (!subject.trim()) return "Please enter a subject.";
                form.append("client_id", String(data.client!.id));
                form.append("subject", subject.trim());
                form.append("topic", topic || "Other");
                if (link.startsWith("p:")) form.append("transaction_id", link.slice(2));
                if (link.startsWith("c:")) form.append("claim_id", link.slice(2));
                return null;
              }}
              onSend={async (form) => {
                const res = await api.upload<{ threadId: number }>("/api/client-messages", form);
                await queryClient.invalidateQueries({ queryKey: ["client-messages"] });
                navigate(`/client-messages/${res.threadId}`);
              }}
            >
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor="msg-subject">Subject</label>
                  <input id="msg-subject" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="msg-topic">Topic</label>
                  <select id="msg-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="">Choose…</option>
                    {data.topics.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="msg-link">Policy or claim (optional)</label>
                  <select id="msg-link" value={link} onChange={(e) => setLink(e.target.value)}>
                    <option value="">None</option>
                    {data.policies.length > 0 && (
                      <optgroup label="Policies">
                        {data.policies.map((p) => (
                          <option key={`p${p.id}`} value={`p:${p.id}`}>{[p.class_of_business, p.policy_no].filter(Boolean).join(" · ") || `Policy ${p.id}`}</option>
                        ))}
                      </optgroup>
                    )}
                    {data.claims.length > 0 && (
                      <optgroup label="Claims">
                        {data.claims.map((c) => (
                          <option key={`c${c.id}`} value={`c:${c.id}`}>{c.claim_no}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            </MessageComposer>
          </>
        )}
      </div>
    </div>
  );
}

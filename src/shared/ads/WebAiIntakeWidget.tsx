// The web AI intake chat, used on the /quote landing pages (floating or embedded) and on /quote/chat, which the
// corporate website can show in an iframe. It asks for a name and WhatsApp number first (the lead is created through
// /api/v1/ads/capture, carrying the stored click ids), then talks to the underwriting assistant through
// /api/v1/ads/chat/web. A returning visitor's conversation is restored. "Continue on WhatsApp" opens wa.me with the
// "[Ref: SLB-XXXX]" tag, so the WhatsApp conversation keeps the same lead and attribution.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { captureLead, chatHistory, chatSend, openWhatsApp, savedChatSession, type ChatSession } from "./adAttribution";
import "./ads.css";

interface Line { id: string; who: "me" | "bot" | "broker"; text: string }
const CHIPS: { label: string; line: string; text: string }[] = [
  { label: "Comprehensive Motor", line: "MOTOR_COMP", text: "I need Comprehensive Motor insurance." },
  { label: "Third-Party NIID", line: "MOTOR_3P", text: "I need Third-Party motor insurance with NIID verification." },
  { label: "Corporate Fleet", line: "FLEET", text: "We need cover for our corporate fleet." },
  { label: "Group Life", line: "GROUP_LIFE", text: "We need Group Life cover for our staff." },
];

export function WebAiIntakeWidget({
  mode = "floating",
  title = "AI Quote Assistant",
  productLine,
  startOpen = false,
}: {
  mode?: "floating" | "embedded";
  title?: string;
  productLine?: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen || mode === "embedded");
  const [session, setSession] = useState<ChatSession | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hp, setHp] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = savedChatSession();
    if (!saved) return;
    chatHistory(saved)
      .then((h) => {
        setSession({ ...saved, whatsapp_deeplink: h.whatsapp_deeplink ?? saved.whatsapp_deeplink });
        setLines(h.messages.map((m) => ({ id: String(m.id), who: m.sender === "USER" ? "me" : m.sender === "BROKER" ? "broker" : "bot", text: m.text })));
      })
      .catch(() => { /* expired or unknown: start again */ });
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines, busy]);

  async function say(text: string, quickReply?: string, s = session) {
    if (!s || (!text.trim() && !quickReply)) return;
    setError(null);
    setLines((l) => [...l, { id: `me-${Date.now()}`, who: "me", text: text || quickReply || "" }]);
    setDraft("");
    setBusy(true);
    try {
      const r = await chatSend(s, text, quickReply);
      setLines((l) => [...l, { id: `bot-${Date.now()}`, who: "bot", text: r.reply }]);
      if (r.handoff) setHandoff(true);
      if (r.whatsapp_deeplink) setSession({ ...s, whatsapp_deeplink: r.whatsapp_deeplink });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function start(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await captureLead({ phone, full_name: name || undefined, product_line: productLine, website: hp || undefined });
      const s = { tracking_ref: r.tracking_ref, chat_token: r.chat_token, whatsapp_deeplink: r.whatsapp_deeplink };
      setSession(s);
      setBusy(false);
      await say(`Hello${name ? `, I'm ${name.split(" ")[0]}` : ""}. I'd like a quote.`, undefined, s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please check your number and try again.");
      setBusy(false);
    }
  }

  const panel = (
    <section className={`adw-panel ${mode === "embedded" ? "is-embedded" : ""}`} aria-label={title}>
      <header className="adw-head">
        <div>
          <strong>{title}</strong>
          <span>NAICOM-licensed broker · replies in seconds</span>
        </div>
        {mode === "floating" ? <button type="button" className="adw-x" aria-label="Close chat" onClick={() => setOpen(false)}>×</button> : null}
      </header>

      {!session ? (
        <form className="adw-start" onSubmit={start} noValidate>
          <p>Tell us who you are and we'll start your quote. We never bind cover in this chat: a licensed broker confirms every quote.</p>
          <label>Your name<input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={150} /></label>
          <label>WhatsApp number<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" autoComplete="tel" required /></label>
          <input type="text" className="adw-hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} aria-hidden="true" />
          {error ? <p className="adw-error" role="alert">{error}</p> : null}
          <button type="submit" className="adw-btn" disabled={busy || !phone.trim()}>{busy ? "Starting…" : "Start chat"}</button>
        </form>
      ) : (
        <>
          <div className="adw-log" aria-live="polite">
            {lines.map((l) => <p key={l.id} className={`adw-msg is-${l.who}`}>{l.text}</p>)}
            {busy ? <p className="adw-msg is-bot is-typing" aria-label="Assistant is typing"><span /><span /><span /></p> : null}
            <div ref={endRef} />
          </div>
          {lines.length <= 2 ? (
            <div className="adw-chips">
              {CHIPS.map((c) => <button key={c.line} type="button" disabled={busy} onClick={() => say(c.text)}>{c.label}</button>)}
            </div>
          ) : null}
          {error ? <p className="adw-error" role="alert">{error}</p> : null}
          {handoff ? <p className="adw-note">A licensed broker has your details and will be in touch shortly.</p> : null}
          <form className="adw-input" onSubmit={(e) => { e.preventDefault(); void say(draft); }}>
            <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your answer…" maxLength={2000} aria-label="Your message" disabled={busy} />
            <button type="submit" className="adw-btn" disabled={busy || !draft.trim()}>Send</button>
          </form>
          {session.whatsapp_deeplink ? (
            <button type="button" className="adw-wa" onClick={() => openWhatsApp(session.whatsapp_deeplink)}>Continue on WhatsApp · {session.tracking_ref}</button>
          ) : null}
        </>
      )}
    </section>
  );

  if (mode === "embedded") return panel;
  return (
    <div className="adw-float">
      {open ? panel : null}
      <button type="button" className="adw-launcher" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Chat with our AI quote assistant"}
      </button>
    </div>
  );
}

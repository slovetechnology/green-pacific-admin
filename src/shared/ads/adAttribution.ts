// Ad attribution in the browser: Google Tag Manager and the Meta Pixel (each loaded once per page load), click-id and
// UTM persistence, and the lead capture call to the API's public /api/v1/ads/capture.
//
// Persistence (localStorage, 90 days): last touch wins. A visit whose URL carries new click ids or UTMs replaces the
// stored set; a visit without them (internal SPA navigation, a bookmark) never erases what is stored. _fbp is read from
// its cookie; _fbc from its cookie, else made from the fbclid as fb.1.<ms>.<fbclid>, Meta's documented format.
// Build-time settings: VITE_GTM_ID (GTM-XXXX) and VITE_META_PIXEL_ID. Without them nothing is loaded.
import { apiUrl } from "@/shared/api/client";

export const CLICK_KEYS = ["gclid", "gbraid", "wbraid", "fbclid"] as const;
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const STORAGE_KEY = "gp_ad_attribution_v1";
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type Attribution = Partial<Record<(typeof CLICK_KEYS)[number] | (typeof UTM_KEYS)[number] | "fbp" | "fbc", string>>;
interface Stored { data: Attribution; expiresAt: number }

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    fbq?: Fbq;
    _fbq?: Fbq;
    __gpAdTagsLoaded?: boolean;
  }
}

const env = (k: string) => String((import.meta.env as Record<string, unknown>)[k] ?? "").trim();
export const GTM_ID = env("VITE_GTM_ID");
export const META_PIXEL_ID = env("VITE_META_PIXEL_ID");

// ------------------------------------------------------------------------------------------- storage
function readStore(now = Date.now()): Attribution {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as Stored;
    if (!s || typeof s.expiresAt !== "number" || s.expiresAt <= now) {
      window.localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return s.data || {};
  } catch {
    return {};
  }
}
function writeStore(data: Attribution, now = Date.now()) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, expiresAt: now + TTL_MS } satisfies Stored));
  } catch {
    // Private mode or storage blocked: attribution for this visit still rides on the capture request.
  }
}

function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Merges the current URL's click ids and UTMs into storage and returns the attribution to send.
 * Pure on its inputs so the rule can be reasoned about: a touch with any new value replaces the stored touch; a
 * touch with none keeps it. Cookie values (_fbp, _fbc) always refresh when present.
 */
export function mergeTouch(stored: Attribution, search: string, cookies: { fbp?: string; fbc?: string }, now = Date.now()): Attribution {
  const params = new URLSearchParams(search);
  const touch: Attribution = {};
  for (const k of [...CLICK_KEYS, ...UTM_KEYS]) {
    const v = params.get(k)?.trim();
    if (v) touch[k] = v.slice(0, 255);
  }
  const newClick = CLICK_KEYS.some((k) => touch[k]);
  const newUtm = UTM_KEYS.some((k) => touch[k]);
  // New click ids: the whole touch is replaced (last touch wins). UTMs alone: the UTMs are replaced and the stored
  // click ids are kept. Nothing new: everything stays.
  let next: Attribution;
  if (newClick) next = { ...touch };
  else if (newUtm) {
    next = { ...touch };
    for (const k of CLICK_KEYS) if (stored[k]) next[k] = stored[k];
  } else next = { ...stored };
  // Keep a known fbp across touches; it identifies the browser, not the click.
  if (stored.fbp && !next.fbp) next.fbp = stored.fbp;
  if (cookies.fbp) next.fbp = cookies.fbp;
  if (cookies.fbc) next.fbc = cookies.fbc;
  else if (touch.fbclid) next.fbc = `fb.1.${now}.${touch.fbclid}`;
  else if (!newClick && stored.fbc) next.fbc = stored.fbc;
  return next;
}

/** Reads the URL and cookies, updates storage, and returns the current attribution. Safe to call on every navigation. */
export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  const merged = mergeTouch(readStore(), window.location.search, { fbp: cookie("_fbp"), fbc: cookie("_fbc") });
  if (Object.keys(merged).length) writeStore(merged);
  return merged;
}
export const currentAttribution = (): Attribution => (typeof window === "undefined" ? {} : readStore());

// ------------------------------------------------------------------------------------------- tags
/** The public marketing pages, the only ones that load GTM and the Pixel. */
export const isMarketingPath = (pathname: string) => pathname === "/quote" || pathname.startsWith("/quote/");

/** Loads GTM and the Meta Pixel once. The SPA's own route changes don't re-run this, so no duplicate PageView. */
export function initAdTags() {
  if (typeof window === "undefined" || window.__gpAdTagsLoaded) return;
  window.__gpAdTagsLoaded = true;
  if (GTM_ID && /^GTM-[A-Z0-9]+$/i.test(GTM_ID)) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
    document.head.appendChild(s);
  }
  if (META_PIXEL_ID && /^\d+$/.test(META_PIXEL_ID) && !window.fbq) {
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    fbq("init", META_PIXEL_ID);
    fbq("track", "PageView");
  }
}

/** The browser half of a lead: Pixel Lead with the server's event id (Meta deduplicates on it) and a GTM event. */
export function trackLead(clientEventId: string, trackingRef: string, extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "Lead", {}, { eventID: clientEventId });
  (window.dataLayer = window.dataLayer || []).push({ event: "generate_lead", tracking_ref: trackingRef, ...extra });
}

// ------------------------------------------------------------------------------------------- capture
export interface CaptureInput {
  phone: string;
  full_name?: string;
  email?: string;
  company_name?: string;
  product_line?: string;
  vehicle_or_asset_details?: string;
  estimated_sum_insured?: number;
  current_policy_expiry?: string;
  message?: string;
  website?: string; // honeypot
}
export interface CaptureResult {
  tracking_ref: string;
  lead_id: number;
  client_event_id: string;
  chat_token: string;
  whatsapp_deeplink: string | null;
}

async function publicJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    credentials: "omit", // the public endpoints use no session
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

const SESSION_KEY = "gp_ad_chat_session_v1";
export interface ChatSession { tracking_ref: string; chat_token: string; whatsapp_deeplink: string | null }
export function savedChatSession(): ChatSession | null {
  try {
    const s = JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null") as ChatSession | null;
    return s?.tracking_ref && s.chat_token ? s : null;
  } catch {
    return null;
  }
}
const saveChatSession = (s: ChatSession) => {
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
};

/** Sends a capture with the stored attribution, fires the Pixel/GTM lead events and remembers the chat session. */
export async function captureLead(input: CaptureInput): Promise<CaptureResult> {
  const result = await publicJson<CaptureResult>("POST", "/api/v1/ads/capture", { ...input, attribution: captureAttribution() });
  if (result.client_event_id) trackLead(result.client_event_id, result.tracking_ref, { product_line: input.product_line });
  if (result.chat_token) saveChatSession({ tracking_ref: result.tracking_ref, chat_token: result.chat_token, whatsapp_deeplink: result.whatsapp_deeplink });
  return result;
}

export interface ChatMessage { id: number; sender: "USER" | "BOT" | "BROKER"; channel: string; text: string; at: string }
export const chatHistory = (s: ChatSession) =>
  publicJson<{ messages: ChatMessage[]; whatsapp_deeplink: string | null }>("GET", `/api/v1/ads/chat/web?tracking_ref=${encodeURIComponent(s.tracking_ref)}&chat_token=${encodeURIComponent(s.chat_token)}`);
export const chatSend = (s: ChatSession, message: string, quickReply?: string) =>
  publicJson<{ reply: string; status: string; handoff: boolean; whatsapp_deeplink: string | null }>("POST", "/api/v1/ads/chat/web", {
    tracking_ref: s.tracking_ref, chat_token: s.chat_token, message, quick_reply: quickReply,
  });

/** wa.me link with "[Ref: SLB-XXXX]" pre-filled; the API's link when the business number is configured there. */
export function openWhatsApp(link: string | null) {
  if (link) window.open(link, "_blank", "noopener");
}

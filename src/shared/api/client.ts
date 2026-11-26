// Base URL of the API. Empty/undefined means same origin (the Vite dev proxy,
// or the backend serving the built app itself). Set VITE_API_URL at build time
// (e.g. https://api.example.com, no trailing slash) when the static site is
// hosted separately from the API.
const API_BASE: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");

// Prefix an API path ("/api/...") with the configured API base URL. Use this
// for anything that does not go through apiFetch: <a href>, <img src>,
// window.open, direct fetch calls. Absolute URLs and protocol-relative ones
// pass through untouched.
export function apiUrl(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? API_BASE + path : path;
}

export const COOKIE_BLOCKED_MESSAGE =
  "Your password was accepted, but this browser blocked the sign-in cookie, so you cannot stay signed in. Allow cookies for this site (turn off tracking protection or third-party cookie blocking for it) and sign in again.";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  status: number;
  // The parsed JSON error body, for endpoints that return more than
  // { error } (e.g. a compliance block's failures and canOverride).
  data: Record<string, unknown> | null;
  constructor(message: string, status: number, data: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let csrfTokenPromise: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
  const data = await res.json();
  return data.csrfToken;
}

function getCsrfToken(forceRefresh = false): Promise<string> {
  if (forceRefresh || !csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken();
  }
  return csrfTokenPromise;
}

// Longer than the API's own limits (45s waiting for the write lock, then the work itself).
const REQUEST_TIMEOUT_MS = 90_000;

interface ApiOptions {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (MUTATING_METHODS.has(method)) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }

  // A save that never answers must end in an error, not a button stuck on "Saving...".
  const send = () => fetch(apiUrl(path), { method, headers, body, credentials: "include", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const guarded = async () => {
    try {
      return await send();
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new ApiError("The server took too long to respond. Please check the record before trying again.", 504);
      }
      throw err;
    }
  };
  let res = await guarded();

  // A stale/missing CSRF token (e.g. after a server restart mid-session)
  // gets one retry with a freshly minted token before surfacing the error.
  if (res.status === 403 && MUTATING_METHODS.has(method)) {
    headers["X-CSRF-Token"] = await getCsrfToken(true);
    res = await guarded();
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError((data && data.error) || res.statusText, res.status, data);
  }
  return data as T;
}

// Multipart submission (the public KYC form's file uploads) — bypasses
// apiFetch's JSON encoding but still carries the CSRF token, since /api/kyc
// is public-but-not-CSRF-exempt (see backend/src/auth/middleware.js).
// The server refuses a document over this size (backend platform/documents/crmUploads.js).
export const MAX_DOCUMENT_MB = 25;

/** A message when a document is too large to upload, else null. Checked before sending it. */
export function documentTooLarge(file: File): string | null {
  if (file.size <= MAX_DOCUMENT_MB * 1024 * 1024) return null;
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `"${file.name}" is ${mb} MB; the limit is ${MAX_DOCUMENT_MB} MB. Make it smaller (for example, scan at a lower resolution or compress the PDF) and try again.`;
}

export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = { "X-CSRF-Token": await getCsrfToken() };
  let res = await fetch(apiUrl(path), { method: "POST", headers, body: formData, credentials: "include" });
  if (res.status === 403) {
    headers["X-CSRF-Token"] = await getCsrfToken(true);
    res = await fetch(apiUrl(path), { method: "POST", headers, body: formData, credentials: "include" });
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError((data && data.error) || res.statusText, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T = unknown>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T = unknown>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  upload: <T = unknown>(path: string, formData: FormData) => apiUpload<T>(path, formData),
};

// POSTs JSON and returns a file (a generated PDF or Word document) with the name the server gave it. Errors come
// back as { error } JSON, like every other call.
export async function apiDownload(path: string, body: unknown): Promise<{ blob: Blob; filename: string }> {
  const send = async (token: string) =>
    fetch(apiUrl(path), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify(body) });
  let res = await send(await getCsrfToken());
  if (res.status === 403) res = await send(await getCsrfToken(true));
  if (!res.ok) {
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : null;
    throw new ApiError((data && data.error) || res.statusText, res.status, data);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "document";
  return { blob: await res.blob(), filename };
}

/** Hands a downloaded file to the browser's save dialog. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function filenameFrom(res: Response, url: URL): string {
  const disposition = res.headers.get("content-disposition") ?? "";
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)?.[1];
  return plain?.trim() || decodeURIComponent(url.pathname.split("/").pop() || "download");
}

/**
 * Opens or saves a file from a GET on the API, sending the session cookie with fetch.
 *
 * Plain links to a separately hosted API (VITE_API_URL) do not work: the browser keeps the API's session cookie as a
 * third-party cookie, tied to this site, and a link that opens the API in its own tab arrives without it ("Not signed
 * in."). `newTab` shows the file in a new tab (PDFs and images); otherwise it is saved.
 */
export async function openApiFile(path: string, { newTab = false }: { newTab?: boolean } = {}): Promise<void> {
  const url = new URL(apiUrl(path), window.location.href);
  // Opened before the request, while the click still counts as a user action, so pop-up blockers allow it.
  const tab = newTab ? window.open("", "_blank") : null;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json().catch(() => null) : null;
      throw new ApiError((data && data.error) || res.statusText || "The file could not be downloaded.", res.status, data);
    }
    const blob = await res.blob();
    const filename = filenameFrom(res, url);
    if (tab && /^(application\/pdf|image\/|text\/plain)/.test(blob.type)) {
      const blobUrl = URL.createObjectURL(blob);
      tab.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } else {
      tab?.close();
      saveBlob(blob, filename);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * Makes every <a href={apiUrl("/api/...")}> in the app (report exports, PDFs, attachments) download through
 * openApiFile when the API is on another origin. Installed once from root.tsx. Same-origin set-ups keep the
 * browser's normal link handling, which already sends the cookie.
 */
export function installApiLinkDownloads(): void {
  if (!API_BASE) return;
  let apiOrigin: string;
  try {
    apiOrigin = new URL(API_BASE, window.location.href).origin;
  } catch {
    return;
  }
  if (apiOrigin === window.location.origin) return;
  const prefix = `${API_BASE}/api/`;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link) return;
    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith(prefix)) return;
    event.preventDefault();
    if (link.getAttribute("aria-busy") === "true") return;
    link.setAttribute("aria-busy", "true");
    const newTab = link.target === "_blank" && !link.hasAttribute("download");
    openApiFile(href, { newTab })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        window.alert(err instanceof ApiError && err.status === 401 ? "Your session has ended. Please sign in again, then retry the download." : `The file could not be downloaded: ${message}`);
      })
      .finally(() => link.removeAttribute("aria-busy"));
  });
}

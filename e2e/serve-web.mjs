// Serves the staff site's production build (build/client) for the browser tests, the way cPanel does: files as they
// are, any other path gets index.html (the SPA's own routing), and /api and /health are passed to the test API, so
// the site and the API share one origin as the dev proxy arranges.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build/client");
const port = Number(process.env.E2E_WEB_PORT || 5199);
const api = new URL(process.env.API_PROXY_TARGET || "http://127.0.0.1:4010");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("No build/client/index.html: run `npm run build` first.");
  process.exit(1);
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/health")) {
    const upstream = http.request({ host: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("API not reachable"); });
    req.pipe(upstream);
    return;
  }
  const clean = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(root, clean);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Staff site on http://127.0.0.1:${port}`));

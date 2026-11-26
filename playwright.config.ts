import { defineConfig } from "@playwright/test";

// Browser smoke tests (G17): `npm run e2e`. Starts the API on a fresh gp_test_e2e database (e2e/start-api.mjs; needs the
// DB_* variables for a MariaDB server, as the API tests do) and serves the staff site's build (`npm run build` first)
// with /api passed to that API.
const API_PORT = Number(process.env.E2E_API_PORT || 4010);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5199);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "off",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: "node e2e/start-api.mjs",
      url: `http://127.0.0.1:${API_PORT}/health/live`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { E2E_API_PORT: String(API_PORT) },
    },
    {
      // The production build (run `npm run build` first; CI does), not the dev server, whose on-demand bundling
      // reloads pages mid-test.
      command: "node e2e/serve-web.mjs",
      url: `http://127.0.0.1:${WEB_PORT}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`, E2E_WEB_PORT: String(WEB_PORT) },
    },
  ],
});

// Starts the API for the browser tests on a fresh database (gp_test_e2e, dropped and created each run) with a known
// staff login and a client and insurer to book against. Uses the DB_* variables for the MariaDB server, as the API
// tests do. Never point this at a real database: it drops gp_test_e2e.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend");
const { default: mysql } = await import(path.join(backend, "node_modules/mysql2/promise.js"));

const DB = "gp_test_e2e"; // the gp_test_ prefix is what the API tests' database account may create
const admin = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1", port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME || process.env.DB_USER || "root", password: process.env.DB_PASSWORD ?? "",
});
await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
await admin.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await admin.end();

Object.assign(process.env, {
  DB_NAME: DB, NODE_ENV: "test", PORT: process.env.E2E_API_PORT || "4010",
  KYC_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"), SESSION_SECRET: "e2e-session-secret",
  STORAGE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "green-e2e-storage-")), FILE_STORAGE_DRIVER: "local",
  LOG_TO_FILES: "false", SANCTIONS_LISTS: "false", LEAD_ENGINE_SCHEDULER: "false",
});
for (const k of ["RESEND_API_KEY", "TERMII_API_KEY", "PREMBLY_API_KEY", "PAYSTACK_SECRET_KEY", "DATABASE_URL"]) delete process.env[k];

const { bootstrapDatabase } = await import(path.join(backend, "src/config/bootstrap.js"));
await bootstrapDatabase();
const M = await import(path.join(backend, "src/models/index.js"));
const { hashPassword } = await import(path.join(backend, "src/modules/platform/auth/passwords.js"));
const { seedChartOfAccounts } = await import(path.join(backend, "src/modules/finance/chart-of-accounts/chartOfAccountsSeed.js"));
await seedChartOfAccounts();
await M.Users.create({
  username: "e2e@greenpacific.test", email: "e2e@greenpacific.test", first_name: "Edith", last_name: "Tester",
  password_hash: hashPassword("e2e-password-123"), role: "admin",
});
await M.Clients.create({ name: "E2E Client Ltd", address: "1 Test Street", city: "Lagos", state: "Lagos" });
await M.Insurers.create({ name: "E2E Insurance Plc" });

await import(path.join(backend, "src/server.js"));

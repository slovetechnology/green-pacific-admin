import { expect, test } from "@playwright/test";
import { signIn, watchForErrors } from "./helpers";

// Every main page opens signed in, with no console error, uncaught exception or server error from the API.
const PAGES = [
  "/", "/growth-engine", "/clients", "/insurers", "/transactions", "/transactions/new", "/receipts", "/receipts/new", "/premium-invoices",
  "/commission-statements", "/renewals", "/claims", "/claims/service", "/tasks", "/kyc-submissions", "/broking-slips",
  "/policy-compliance", "/refunds", "/settlements", "/producer-payables", "/cash-bank", "/insurer-remittances",
  "/expenses", "/financials", "/accounting-periods", "/ledger", "/ledger/journals", "/ledger/trial-balance",
  "/ledger/profit-and-loss", "/ledger/balance-sheet", "/ledger/settings", "/chart-of-accounts", "/premium-statements",
  "/compliance/returns", "/compliance/sanctions", "/compliance/data-protection", "/reports/monthly-production",
  "/reports/cancelled-transactions", "/appraisal", "/account",
];

test("signs in and opens every main page cleanly", async ({ page }) => {
  const problems = watchForErrors(page);
  await signIn(page);
  for (const path of PAGES) {
    await test.step(path, async () => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("#email"), `${path} asked to sign in again`).toHaveCount(0);
      await expect(page.locator("main, .app-main, body").first()).not.toContainText(/Something went wrong|Unexpected Application Error/);
      expect(problems(), path).toEqual([]);
    });
  }
});

import { expect, test } from "@playwright/test";
import { signIn, watchForErrors } from "./helpers";

// The two money paths staff use most, end to end through the browser: book a policy, then receipt its premium.
test("books a policy on the transaction form and receipts its premium", async ({ page }) => {
  const problems = watchForErrors(page);
  await signIn(page);
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const policyNo = `E2E/${Date.now()}`;

  await test.step("save a policy", async () => {
    await page.goto("/transactions/new");
    await page.locator("#client_name").fill("E2E Client Ltd");
    await page.locator("#insurer_name").fill("E2E Insurance Plc");
    await page.locator("#trans_date").fill(today);
    await page.locator("#class_of_business").selectOption("Travel Insurance");
    await page.locator("#business_type").selectOption({ index: 1 });
    if ((await page.locator("#business_type").inputValue()) === "Renewal") await page.locator("#business_type").selectOption({ index: 2 });
    await page.locator("#policy_no").fill(policyNo);
    await page.locator("#start_date").fill(today);
    await page.locator("#end_date").fill(nextYear);
    await page.locator("#sum_insured").fill("5000000");
    await page.locator("#premium_due").fill("100000");
    await page.locator("#commission_rate").fill("0.2");
    await page.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/transactions\/\d+$/);
    await expect(page.getByText(policyNo).first()).toBeVisible();
  });

  await test.step("receipt its premium", async () => {
    await page.goto("/receipts/new");
    await page.locator("#client_id").selectOption({ label: "E2E Client Ltd" });
    await page.locator("#receipt_date").fill(today);
    await page.locator("#payment_method").selectOption("Bank Transfer");
    await page.locator("#payment_reference").fill("E2E-TRF-1");
    const policy = page.locator("tbody select").first();
    await expect(policy.locator("option", { hasText: policyNo })).toHaveCount(1);
    await policy.selectOption({ label: (await policy.locator("option", { hasText: policyNo }).textContent())!.trim() });
    await expect(page.locator("tbody input[type=number]").first()).toHaveValue(/100000/);
    await page.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/receipts\/\d+$/);
    await expect(page.getByText(policyNo).first()).toBeVisible();
    // G4: a bank transfer of NGN 10,000 or more shows the stamp duty the bank deducts.
    await expect(page.getByText(/Stamp duty/)).toBeVisible();
  });

  await test.step("the policy is now paid", async () => {
    await page.goto(`/transactions?q=${encodeURIComponent(policyNo)}`);
    const row = page.locator("tr", { hasText: policyNo }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Paid", { exact: true })).toBeVisible();
  });

  expect(problems()).toEqual([]);
});

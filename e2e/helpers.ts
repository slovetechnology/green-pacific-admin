import { expect, type Page } from "@playwright/test";

export const STAFF = { email: "e2e@greenpacific.test", password: "e2e-password-123" };

/** Signs in on the sign-in screen every staff page shows when nobody is signed in. */
export async function signIn(page: Page) {
  await page.goto("/");
  await page.locator("#email").fill(STAFF.email);
  await page.locator("#password").fill(STAFF.password);
  await page.locator("button[type=submit]").click();
  await expect(page.locator("#email")).toHaveCount(0);
}

/**
 * Collects what would tell us a page is broken: console errors, uncaught exceptions and API answers of 500 or more.
 * Returns a function that lists them.
 */
export function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // A 4xx the page shows to the user is logged by the browser as a failed resource; that is not a bug.
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    problems.push(`console: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`exception: ${err.message}`));
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 500) problems.push(`API ${res.status()}: ${res.request().method()} ${res.url()}`);
  });
  return () => problems;
}

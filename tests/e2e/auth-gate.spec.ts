import { test, expect } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_KEY ?? process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

test.describe("Auth gate", () => {
  test("no key → Access Denied", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("Access Denied");
  });

  test("wrong key → Access Denied", async ({ page }) => {
    await page.goto("/?key=wrong_key_12345");
    await expect(page.locator("body")).toContainText("Access Denied");
  });

  test("correct key → dashboard renders", async ({ page }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY env var not set");
    await page.goto(`/?key=${ADMIN_KEY}`);
    await expect(page.locator("body")).toContainText("Agent Economy");
  });
});

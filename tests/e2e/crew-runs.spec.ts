import { test, expect } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

test.describe("Crew Run detail", () => {
  test.beforeEach(({ page: _ }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY env var not set");
  });

  test("click first run link navigates to /crew-runs/[id]", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);

    // Find first run link (crew run ID links in the table)
    const firstRunLink = page.locator("a.conv-link[href*='/crew-runs/']").first();
    const count = await firstRunLink.count();
    test.skip(count === 0, "No crew runs exist yet");

    await firstRunLink.click();
    await expect(page).toHaveURL(/\/crew-runs\//);
  });

  test("crew run detail page contains Crew Run heading", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    const firstRunLink = page.locator("a.conv-link[href*='/crew-runs/']").first();
    const count = await firstRunLink.count();
    test.skip(count === 0, "No crew runs exist yet");

    await firstRunLink.click();
    await expect(page.locator("body")).toContainText("Crew Run");
  });

  test("crew run detail page has Export CSV link", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    const firstRunLink = page.locator("a.conv-link[href*='/crew-runs/']").first();
    const count = await firstRunLink.count();
    test.skip(count === 0, "No crew runs exist yet");

    await firstRunLink.click();
    const exportLink = page.locator("a", { hasText: /export.*csv/i });
    await expect(exportLink).toBeVisible();
  });
});

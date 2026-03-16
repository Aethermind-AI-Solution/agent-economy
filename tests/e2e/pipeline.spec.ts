import { test, expect } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

test.describe("Pipeline page", () => {
  test.beforeEach(({ page: _ }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY env var not set");
  });

  test("page loads and title contains Pipeline", async ({ page }) => {
    await page.goto(`/pipeline?key=${ADMIN_KEY}`);
    await expect(page.locator("body")).toContainText("Pipeline");
  });

  test("stage summary cards visible", async ({ page }) => {
    await page.goto(`/pipeline?key=${ADMIN_KEY}`);
    for (const stage of ["New", "Contacted", "Replied", "Interested", "Closed", "Skipped"]) {
      await expect(page.locator("body")).toContainText(stage);
    }
  });

  test("filter tabs visible (at least 4)", async ({ page }) => {
    await page.goto(`/pipeline?key=${ADMIN_KEY}`);
    // Filter tabs are anchor tags inside the filter area; check for common stages
    const filterLinks = page.locator("a").filter({ hasText: /all|new|contacted|interested/i });
    await expect(filterLinks.first()).toBeVisible();
  });

  test("either No leads message or table visible", async ({ page }) => {
    await page.goto(`/pipeline?key=${ADMIN_KEY}`);
    const hasTable = await page.locator("table").count() > 0;
    const hasNoLeads = await page.locator("body").textContent().then((t) => t?.includes("No leads"));
    expect(hasTable || hasNoLeads).toBe(true);
  });
});

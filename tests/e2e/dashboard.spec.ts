import { test, expect } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

test.describe("Dashboard", () => {
  test.beforeEach(({ page: _ }) => {
    test.skip(!ADMIN_KEY, "ADMIN_KEY env var not set");
  });

  test("8 stat cards visible", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    const statCards = page.locator(".stat");
    await expect(statCards).toHaveCount(8);
  });

  test("agents table has Name header", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    const nameHeader = page.locator("table th").filter({ hasText: "Name" });
    await expect(nameHeader.first()).toBeVisible();
  });

  test("Crew Runs section heading visible", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    await expect(page.locator("body")).toContainText("Crew Runs");
  });

  test("Pipeline link in header navigates to /pipeline", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    const pipelineLink = page.locator("a", { hasText: "Pipeline →" });
    await pipelineLink.click();
    await expect(page).toHaveURL(/\/pipeline/);
  });

  test("New Run form has query input and submit button", async ({ page }) => {
    await page.goto(`/?key=${ADMIN_KEY}`);
    await expect(page.locator("input[name='query']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });
});

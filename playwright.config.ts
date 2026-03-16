import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3001",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    port: 3001,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

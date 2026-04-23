import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes the dev server is already running at `baseURL`.
 * Start it manually with `npm run dev` before running these tests — we do
 * NOT spawn it from the config so the test run doesn't clobber a server
 * you're already using to debug.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

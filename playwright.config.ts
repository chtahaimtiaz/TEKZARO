import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Vitest (built on Vite) loads .env automatically; Playwright's test
// runner is plain Node and does not, so DATABASE_URL etc. would otherwise
// be undefined in every spec/helper that imports lib/prisma directly.

// This project has no separate staging database — local dev and production
// point at the same Neon instance (see tests/helpers.ts and the vitest
// suite's own hermetic-test discipline). Every E2E spec here follows the
// same rules: dedicated, uniquely-named fixtures (never the real bootstrap
// admin account), and cleanup in afterAll. See e2e/helpers.ts.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  // Generous: against next dev (chosen for fast local iteration over
  // next build && next start), the first request to any given route pays
  // a one-time on-demand compile that can comfortably exceed a tight
  // timeout — this isn't a real slowness bug, just dev mode's own
  // characteristic. A production build has no equivalent cold-compile cost.
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 45000,
    hookTimeout: 45000,
    // e2e/**/*.spec.ts are Playwright specs (npx playwright test), not
    // vitest's — vitest's default include glob would otherwise also pick
    // them up and fail on Playwright's own test.describe().
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

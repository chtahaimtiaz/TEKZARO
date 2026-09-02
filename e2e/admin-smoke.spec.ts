import { test, expect } from "@playwright/test";
import { createE2EUser, deleteE2EUsers, loginViaUI, loginViaSession, clearLoginRateLimit } from "./helpers";
import { prisma } from "../lib/prisma";

// Renders every major admin page with a real logged-in session. This is
// deliberately a render smoke test, not a re-test of business logic
// already covered by the vitest suite — its job is to catch the class of
// bug unit tests structurally can't see: a page that compiles and
// typechecks fine but crashes the moment it actually renders with real
// data (confirmed live during Stage 5: a Server Action wired via an inline
// closure instead of .bind() passed tsc/build/vitest cleanly and only
// crashed on real render).
test.describe("Admin — render smoke test across every major page", () => {
  let admin: Awaited<ReturnType<typeof createE2EUser>>;

  test.beforeAll(async () => {
    await clearLoginRateLimit();
    admin = await createE2EUser("ADMIN", "admin-smoke");
  });

  test.afterAll(async () => {
    await deleteE2EUsers([admin.id]);
  });

  const pages = [
    "/admin",
    "/admin/articles",
    "/admin/articles/new",
    "/admin/checklist",
    "/admin/discovery",
    "/admin/sources",
    "/admin/categories",
    "/admin/authors",
    "/admin/keywords",
    "/admin/digest",
    "/admin/media",
    "/admin/newsletter",
    "/admin/newsletter/subscribers",
    "/admin/analytics",
    "/admin/advertisers",
    "/admin/ad-campaigns",
    "/admin/ad-campaigns/new",
    "/admin/audit-log",
    "/admin/monitoring",
    "/admin/users",
    "/admin/notifications",
  ];

  test("login works with a real session cookie", async ({ page }) => {
    await loginViaUI(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator("h1", { hasText: "Welcome" })).toBeVisible();
  });

  for (const path of pages) {
    test(`${path} renders without a server-error boundary`, async ({ page, context, baseURL }) => {
      await loginViaSession(context, admin.id, baseURL!);
      const response = await page.goto(path);
      expect(response?.status(), `${path} returned a non-OK status`).toBeLessThan(500);
      await expect(page.locator("text=Something went wrong")).not.toBeVisible();
      await expect(page.locator("text=hit an unexpected error")).not.toBeVisible();
    });
  }

  test("an existing published article's edit page renders with its real workflow buttons", async ({ page, context, baseURL }) => {
    const article = await prisma.article.findFirst({ where: { status: "PUBLISHED", isDemo: false }, orderBy: { publishedAt: "desc" } });
    test.skip(!article, "No published article exists to check.");
    if (!article) return;

    await loginViaSession(context, admin.id, baseURL!);
    const response = await page.goto(`/admin/articles/${article.id}`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
    await expect(page.locator("text=Archive")).toBeVisible();
  });
});

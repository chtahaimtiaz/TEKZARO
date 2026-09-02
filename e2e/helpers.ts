import type { Page, BrowserContext } from "@playwright/test";
import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
// lib/password.ts, not lib/auth.ts — the latter is marked "server-only"
// and throws when imported outside Next's own bundler pipeline (which
// Playwright's Node-side test runner isn't). See the note at the top of
// lib/password.ts.
import { hashPassword } from "../lib/password";
import type { Role } from "@prisma/client";

/**
 * This suite runs against the same database as production (see the note
 * in playwright.config.ts) — every fixture here is created fresh, given a
 * unique "ZZZ E2E" name/email, and deleted in the spec's own afterAll.
 * Never the real bootstrap admin account: a dedicated ADMIN test user is
 * created per run instead, so no real credential ever appears in this
 * repo or gets exercised by CI.
 */

export function uniqueLabel(label: string): string {
  return `ZZZ E2E ${label} ${Date.now()}-${randomBytes(3).toString("hex")}`;
}

export interface E2EUser {
  id: string;
  email: string;
  password: string;
}

export async function createE2EUser(role: Role, label: string): Promise<E2EUser> {
  const password = `E2E-${randomBytes(9).toString("hex")}!`;
  const email = `e2e-${label}-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
  const user = await prisma.user.create({
    data: { name: uniqueLabel(label), email, passwordHash: await hashPassword(password), role, active: true },
  });
  return { id: user.id, email: user.email, password };
}

export async function deleteE2EUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin", { timeout: 30000 });
}

const SESSION_COOKIE = "tekzaro_session";

/**
 * Creates a real Session row and drops its cookie into the browser
 * context directly — same trick tests/helpers.ts's loginAs() uses against
 * vitest's mocked cookie store, applied here to a real browser context.
 * Every subsequent request still goes through real server-side session
 * validation; this only skips re-exercising the login FORM POST itself,
 * which is real-tested once in admin-smoke's dedicated "login works" test.
 * Necessary, not just faster: loginAction rate-limits at 10 attempts per
 * 10 minutes per IP (lib/auth-actions.ts) — a suite that logs in via the
 * real form before every one of 20+ page checks blows through that budget
 * on its own and starts failing on the rate limit, not on anything real.
 */
export async function loginViaSession(context: BrowserContext, userId: string, baseURL: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHmac("sha256", process.env.AUTH_SECRET!).update(token).digest("hex");
  await prisma.session.create({ data: { tokenHash, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }]);
}

export async function clearLoginRateLimit(): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "login:" } } });
}

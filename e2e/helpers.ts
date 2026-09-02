import type { Page, BrowserContext, Browser } from "@playwright/test";
import { randomBytes } from "node:crypto";
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
 * Logs in once via the real form and hands back the raw session-cookie
 * value, so a whole spec file can inject that SAME server-issued session
 * into as many fresh per-test browser contexts as it needs via
 * injectSessionCookie() below, instead of logging in through the real
 * form on every single page check (loginAction rate-limits at 10 attempts
 * per 10 minutes per IP — a suite doing that before each of 20+ page
 * checks blows through that budget on its own).
 *
 * This replaces an earlier loginViaSession() that built its own Session
 * row locally, hashing the token with HMAC-SHA256(process.env.AUTH_SECRET)
 * to match lib/password.ts's hashOpaqueToken(). That's only correct when
 * the E2E runner's local AUTH_SECRET is byte-for-byte the same value the
 * target deployment has configured — true for a local dev server sharing
 * one .env, false for a real Vercel deployment with its own env vars.
 * On a secret mismatch the locally-computed hash matches no real Session
 * row, so the app quietly treats every request as logged out — proven
 * live: it silently redirected every "renders without a server-error
 * boundary" check in admin-smoke.spec.ts to /admin/login, and only the
 * two tests with assertions specific enough to notice (checking for the
 * Archive button, checking for the advertiser form's own input) actually
 * failed. Reusing a real, server-issued cookie sidesteps the whole class
 * of bug — there's no hash to get wrong, because nothing is computed.
 */
export async function establishSessionCookie(browser: Browser, baseURL: string, email: string, password: string): Promise<string> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await loginViaUI(page, email, password);
  const cookies = await context.cookies();
  const token = cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  await context.close();
  if (!token) throw new Error("Real login did not set a session cookie.");
  return token;
}

export async function injectSessionCookie(context: BrowserContext, baseURL: string, token: string): Promise<void> {
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }]);
}

export async function clearLoginRateLimit(): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "login:" } } });
}

import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";

// Real signup, real DB row (same shared database as production — see
// playwright.config.ts) — cleaned up in afterAll rather than left behind
// as debris. Rate-limit keys are cleared first so repeated local runs of
// this spec don't get blocked by subscribeToNewsletter's 5/hour cap.
test.describe("Newsletter signup", () => {
  const createdEmails: string[] = [];

  test.beforeAll(async () => {
    await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "newsletter-signup:" } } });
  });

  test.afterAll(async () => {
    if (createdEmails.length) {
      await prisma.newsletterSubscriber.deleteMany({ where: { email: { in: createdEmails } } });
    }
  });

  test("submitting the homepage newsletter form creates a PENDING subscriber and shows the confirmation message", async ({ page }) => {
    const email = `e2e-newsletter-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    createdEmails.push(email);

    await page.goto("/");
    await page.fill('input[name="email"]', email);
    await page.click('button:has-text("Subscribe")');
    await page.waitForURL(/newsletter=pending/);

    await expect(page.locator("text=Check your email to confirm your subscription.")).toBeVisible();

    const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    expect(subscriber).not.toBeNull();
    expect(subscriber?.status).toBe("PENDING");
  });
});

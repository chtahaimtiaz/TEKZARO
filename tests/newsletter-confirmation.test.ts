import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { captureRedirect, cleanupRateLimitKey } from "./helpers";

// Hoisted above imports — subscribeToNewsletter/confirmSubscriptionAction
// call lib/email/provider's sendEmail internally, which needs SMTP to look
// "configured" for a confirmation/welcome email (and thus a real token) to
// be created at all. No real network call is made; nodemailer is mocked.
const sendMailMock = vi.fn(async () => ({ messageId: "mock-message-id" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_FROM = "TEKZARO <noreply@tekzaro.test>";

const { subscribeToNewsletter } = await import("../lib/actions");
const { confirmSubscriptionAction, unsubscribeAction } = await import("../lib/newsletter-actions");
const { createConfirmationToken, consumeConfirmationToken } = await import("../lib/newsletter-confirmation");

function uniqueEmail(label: string): string {
  return `nl-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const createdSubscriberIds: string[] = [];
function track(id: string) {
  createdSubscriberIds.push(id);
}

beforeAll(async () => {
  // Every subscribeToNewsletter call in this file shares one rate-limit key
  // (getClientIp() resolves to "unknown" outside a real request) — clear it
  // first so a prior interrupted run doesn't push this run over the limit.
  await cleanupRateLimitKey("newsletter-signup:unknown");
  await cleanupRateLimitKey("newsletter-confirm:unknown");
});

afterEach(() => sendMailMock.mockClear());

afterAll(async () => {
  if (createdSubscriberIds.length) {
    // NewsletterConfirmationToken cascades on subscriber delete.
    await prisma.newsletterSubscriber.deleteMany({ where: { id: { in: createdSubscriberIds } } });
  }
  await cleanupRateLimitKey("newsletter-signup:unknown");
  await cleanupRateLimitKey("newsletter-confirm:unknown");
});

describe("newsletter confirmation tokens", () => {
  it("stores only a hash — the raw token isn't recoverable from the DB row", async () => {
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("hash"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const { rawToken } = await createConfirmationToken(subscriber.id);
    const row = await prisma.newsletterConfirmationToken.findFirst({ where: { subscriberId: subscriber.id } });
    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(rawToken);
  });

  it("consumes a valid token exactly once", async () => {
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("once"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const { rawToken } = await createConfirmationToken(subscriber.id);
    expect(await consumeConfirmationToken(rawToken)).toEqual({ subscriberId: subscriber.id });
    expect(await consumeConfirmationToken(rawToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("expired"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const { rawToken } = await createConfirmationToken(subscriber.id);
    await prisma.newsletterConfirmationToken.updateMany({
      where: { subscriberId: subscriber.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await consumeConfirmationToken(rawToken)).toBeNull();
  });

  it("rejects a bogus token", async () => {
    expect(await consumeConfirmationToken("not-a-real-token")).toBeNull();
  });

  it("under a simulated concurrent double-claim, only one caller succeeds", async () => {
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("race"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const { rawToken } = await createConfirmationToken(subscriber.id);
    const [a, b] = await Promise.all([consumeConfirmationToken(rawToken), consumeConfirmationToken(rawToken)]);
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
  });
});

describe("subscribeToNewsletter (double opt-in signup)", () => {
  it("a new email is created PENDING with a confirmation token, and a confirmation (not welcome) email is sent", async () => {
    const email = uniqueEmail("signup");
    const form = new FormData();
    form.set("email", email);

    const url = await captureRedirect(() => subscribeToNewsletter("/newsletter", form));
    expect(url).toBe("/newsletter?newsletter=pending");

    const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    track(subscriber.id);
    expect(subscriber.status).toBe("PENDING");

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("Confirm") }));

    const token = await prisma.newsletterConfirmationToken.findFirst({ where: { subscriberId: subscriber.id } });
    expect(token).not.toBeNull();
  });

  it("re-signing up while PENDING reissues a token rather than duplicating the subscriber", async () => {
    const email = uniqueEmail("resend");
    const form = new FormData();
    form.set("email", email);

    await captureRedirect(() => subscribeToNewsletter("/newsletter", form));
    const first = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    track(first.id);

    await captureRedirect(() => subscribeToNewsletter("/newsletter", form));
    const afterResend = await prisma.newsletterSubscriber.findMany({ where: { email } });

    expect(afterResend).toHaveLength(1); // no duplicate row
    expect(afterResend[0].id).toBe(first.id);
    expect(sendMailMock).toHaveBeenCalledTimes(2); // one email per signup attempt
  });

  it("confirming flips PENDING to CONFIRMED and sends a welcome email", async () => {
    const email = uniqueEmail("confirm");
    const form = new FormData();
    form.set("email", email);
    await captureRedirect(() => subscribeToNewsletter("/newsletter", form));

    const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    track(subscriber.id);
    sendMailMock.mockClear();

    const { rawToken } = await createConfirmationToken(subscriber.id); // fresh token for a clean assertion
    const result = await confirmSubscriptionAction(rawToken);
    expect(result.ok).toBe(true);

    const confirmed = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("subscribed") }));
  });

  it("an already-confirmed resubscribe attempt sends no confirmation link and doesn't duplicate", async () => {
    const email = uniqueEmail("already-confirmed");
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email, status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);
    sendMailMock.mockClear();

    const form = new FormData();
    form.set("email", email);
    const url = await captureRedirect(() => subscribeToNewsletter("/newsletter", form));

    expect(url).toBe("/newsletter?newsletter=pending"); // same generic response — no enumeration signal
    const rows = await prisma.newsletterSubscriber.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("CONFIRMED"); // unchanged

    // At most a quiet notice, never a fresh confirmation link.
    const newToken = await prisma.newsletterConfirmationToken.findFirst({
      where: { subscriberId: subscriber.id },
      orderBy: { createdAt: "desc" },
    });
    expect(newToken).toBeNull();
  });

  it("an unsubscribed subscriber's still-valid old confirmation token cannot resurrect them", async () => {
    const email = uniqueEmail("resurrect");
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email, status: "PENDING", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const { rawToken } = await createConfirmationToken(subscriber.id);

    // Unsubscribed via a different link before the confirmation link is used.
    await prisma.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { status: "UNSUBSCRIBED" } });

    const result = await confirmSubscriptionAction(rawToken);
    // The token was genuine and gets consumed either way, but the page must
    // never claim success here — a stale token can't resurrect an
    // unsubscribed row, and the UI has to say so, not "confirmed."
    expect(result.ok).toBe(false);
    expect(result.status).toBe("UNSUBSCRIBED");

    const after = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(after.status).toBe("UNSUBSCRIBED"); // still unsubscribed, not resurrected

    // And the token is burned — a second attempt also fails cleanly.
    const second = await confirmSubscriptionAction(rawToken);
    expect(second.ok).toBe(false);
  });

  it("unsubscribeAction moves a CONFIRMED subscriber to UNSUBSCRIBED and is idempotent", async () => {
    const email = uniqueEmail("unsub");
    const subscriber = await prisma.newsletterSubscriber.create({
      data: { email, status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    track(subscriber.id);

    const first = await unsubscribeAction(subscriber.unsubscribeToken);
    expect(first.ok).toBe(true);
    const after = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: subscriber.id } });
    expect(after.status).toBe("UNSUBSCRIBED");

    const second = await unsubscribeAction(subscriber.unsubscribeToken);
    expect(second.ok).toBe(false); // already unsubscribed, not a fresh success
  });
});

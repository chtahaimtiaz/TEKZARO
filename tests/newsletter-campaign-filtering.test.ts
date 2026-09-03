import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";

// Hoisted above imports — sendCampaignAction calls lib/email/provider's
// sendEmail per selected recipient; mocked so no real network call happens
// and so we can assert on exactly who was mailed.
const sendMailMock = vi.fn(async () => ({ messageId: "mock-message-id" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

// Cleared explicitly — the real .env carries a live RESEND_API_KEY, which
// takes priority over SMTP in lib/email/provider and would route these
// sends through the unmocked Resend branch instead of the mocked
// transporter above.
delete process.env.RESEND_API_KEY;
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_FROM = "TEKZARO <noreply@tekzaro.test>";

const { createCampaignAction, sendCampaignAction } = await import("../lib/newsletter-actions");

function uniqueEmail(label: string): string {
  return `nl-campaign-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const subscriberIds: string[] = [];
const campaignIds: string[] = [];

beforeAll(async () => {
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "newsletter-signup:" } } });
});

afterAll(async () => {
  clearSession();
  if (subscriberIds.length) {
    await prisma.newsletterSubscriber.deleteMany({ where: { id: { in: subscriberIds } } });
  }
  if (campaignIds.length) {
    await prisma.newsletterCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  }
  await cleanupTestData();
});

describe("newsletter campaign filtering — only CONFIRMED subscribers are ever mailed", () => {
  it("selects exactly the CONFIRMED subscriber, excluding PENDING and UNSUBSCRIBED", async () => {
    const pending = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("pending"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    const confirmed = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("confirmed"), status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    const unsubscribed = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("unsubscribed"), status: "UNSUBSCRIBED", unsubscribeToken: randomUUID() },
    });
    subscriberIds.push(pending.id, confirmed.id, unsubscribed.id);

    const admin = await createTestUser("ADMIN", "campaign-filter");
    trackUser(admin.id);
    await loginAs(admin.id);

    // This is a real, shared dev database — other genuinely CONFIRMED
    // subscribers may already exist beyond the 3 created for this test, and
    // a real send correctly reaches all of them. So this test doesn't
    // assert "exactly one recipient"; it asserts the specific inclusion/
    // exclusion that actually matters: the CONFIRMED test row is among the
    // recipients, and the PENDING/UNSUBSCRIBED test rows never are.
    const expectedRecipientCount = await prisma.newsletterSubscriber.count({ where: { status: "CONFIRMED" } });

    const form = new FormData();
    form.set("subject", `Filter Test ${Date.now()}`);
    form.set("bodyHtml", "<p>Body</p>");
    const created = await createCampaignAction(form);
    expect(created.ok).toBe(true);
    if (created.data?.id) campaignIds.push(created.data.id);

    sendMailMock.mockClear();
    const sendResult = await sendCampaignAction(created.data!.id);
    expect(sendResult.ok).toBe(true);

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: confirmed.email }));
    expect(sendMailMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: pending.email }));
    expect(sendMailMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: unsubscribed.email }));

    const campaign = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: created.data!.id } });
    expect(campaign.status).toBe("SENT");
    expect(campaign.recipientCount).toBe(expectedRecipientCount);

    clearSession();
  });
});

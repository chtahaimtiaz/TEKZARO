import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { buildSubscriberWhere } from "../lib/newsletter-subscribers";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData, uniqueEmail } from "./helpers";

// Hoisted above imports — sendTestCampaignAction calls lib/email/provider's
// sendEmail; mocked so no real network call happens and so we can assert on
// exactly who was mailed and with what subject.
const sendMailMock = vi.fn(async () => ({ messageId: "mock-message-id" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}));

process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_FROM = "TEKZARO <noreply@tekzaro.test>";

const { createCampaignAction, sendTestCampaignAction } = await import("../lib/newsletter-actions");
const { GET: exportSubscribers } = await import("../app/api/admin/newsletter-subscribers-export/route");

const subscriberIds: string[] = [];
const campaignIds: string[] = [];

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

function exportRequest(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/newsletter-subscribers-export${qs}`);
}

describe("buildSubscriberWhere — pure filter logic shared by the list page and CSV export", () => {
  it("returns an empty filter when nothing is given", () => {
    expect(buildSubscriberWhere({})).toEqual({});
  });

  it("filters by email substring, case-insensitive", () => {
    expect(buildSubscriberWhere({ q: "Example" })).toEqual({
      email: { contains: "Example", mode: "insensitive" },
    });
  });

  it("filters by a recognized status", () => {
    expect(buildSubscriberWhere({ status: "CONFIRMED" })).toEqual({ status: "CONFIRMED" });
  });

  it("ignores an unrecognized status rather than throwing or matching everything as that literal value", () => {
    expect(buildSubscriberWhere({ status: "NOT_A_REAL_STATUS" })).toEqual({});
  });

  it("combines q and status", () => {
    expect(buildSubscriberWhere({ q: "foo", status: "PENDING" })).toEqual({
      email: { contains: "foo", mode: "insensitive" },
      status: "PENDING",
    });
  });
});

describe("sendTestCampaignAction — self-send only, never touches subscribers or campaign state", () => {
  it("mails only the acting admin, prefixes the subject, and leaves the campaign row untouched", async () => {
    const admin = await createTestUser("ADMIN", "send-test-campaign");
    trackUser(admin.id);
    await loginAs(admin.id);

    const form = new FormData();
    const subject = `Send Test Subject ${Date.now()}`;
    form.set("subject", subject);
    form.set("bodyHtml", "<p>Body</p>");
    const created = await createCampaignAction(form);
    expect(created.ok).toBe(true);
    if (created.data?.id) campaignIds.push(created.data.id);

    sendMailMock.mockClear();
    const result = await sendTestCampaignAction(created.data!.id);
    expect(result.ok).toBe(true);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: admin.email, subject: `[TEST] ${subject}` }));

    const campaign = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: created.data!.id } });
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.sentAt).toBeNull();
    expect(campaign.recipientCount).toBeNull();

    const log = await prisma.auditLog.findFirst({
      where: { action: "newsletter_campaign_test_sent", entityId: created.data!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect((log?.metadata as { to?: string } | null)?.to).toBe(admin.email);

    clearSession();
  });

  it("returns a clean error for a campaign that doesn't exist", async () => {
    const admin = await createTestUser("ADMIN", "send-test-missing");
    trackUser(admin.id);
    await loginAs(admin.id);

    const result = await sendTestCampaignAction("does-not-exist");
    expect(result).toEqual({ ok: false, error: "Campaign not found." });

    clearSession();
  });

  it("reports SMTP not configured instead of silently succeeding", async () => {
    const admin = await createTestUser("ADMIN", "send-test-unconfigured");
    trackUser(admin.id);
    await loginAs(admin.id);

    const form = new FormData();
    form.set("subject", `Unconfigured Test ${Date.now()}`);
    form.set("bodyHtml", "<p>Body</p>");
    const created = await createCampaignAction(form);
    if (created.data?.id) campaignIds.push(created.data.id);

    const savedHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const result = await sendTestCampaignAction(created.data!.id);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("SMTP isn't configured.");
    } finally {
      process.env.SMTP_HOST = savedHost;
    }

    clearSession();
  });
});

describe("newsletter subscribers CSV export — respects filters, requires permission, is audited", () => {
  it("requires CAN_SEND_NEWSLETTER — an unauthenticated request is refused", async () => {
    clearSession();
    const response = await exportSubscribers(exportRequest(""));
    expect(response.status).toBe(403);
  });

  it("requires CAN_SEND_NEWSLETTER — a REPORTER is refused", async () => {
    const reporter = await createTestUser("REPORTER", "export-reporter");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const response = await exportSubscribers(exportRequest(""));
    expect(response.status).toBe(403);

    clearSession();
  });

  it("exports only the subscriber matching the q filter, and audits the export", async () => {
    const admin = await createTestUser("ADMIN", "export-admin");
    trackUser(admin.id);
    await loginAs(admin.id);

    const label = `csvexport${Date.now()}`;
    const target = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail(label), status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    const other = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("csvexport-other"), status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    subscriberIds.push(target.id, other.id);

    const response = await exportSubscribers(exportRequest(`?q=${label}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");

    const body = await response.text();
    expect(body).toContain(target.email);
    expect(body).not.toContain(other.email);

    const log = await prisma.auditLog.findFirst({
      where: { userId: admin.id, action: "newsletter_subscribers_exported" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect((log?.metadata as { filters?: { q?: string } } | null)?.filters?.q).toBe(label);

    clearSession();
  });

  it("filters by status", async () => {
    const admin = await createTestUser("ADMIN", "export-status-admin");
    trackUser(admin.id);
    await loginAs(admin.id);

    const confirmed = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("csvexport-confirmed"), status: "CONFIRMED", unsubscribeToken: randomUUID() },
    });
    const pending = await prisma.newsletterSubscriber.create({
      data: { email: uniqueEmail("csvexport-pending"), status: "PENDING", unsubscribeToken: randomUUID() },
    });
    subscriberIds.push(confirmed.id, pending.id);

    const response = await exportSubscribers(exportRequest(`?q=csvexport-&status=PENDING`));
    const body = await response.text();
    expect(body).toContain(pending.email);
    expect(body).not.toContain(confirmed.email);

    clearSession();
  });
});

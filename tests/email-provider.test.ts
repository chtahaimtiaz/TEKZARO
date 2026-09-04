import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../lib/prisma";

// Explicitly unset here rather than relying on ambient .env being blank —
// this project's real .env now legitimately carries live credentials
// (RESEND_API_KEY, SMTP_*), so "unconfigured" has to be forced rather than
// assumed. Each vitest file runs in its own worker with its own process.env
// copy (see email-provider-mocked.test.ts's same pattern), so this can't
// leak into other test files.
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

// This file mocks the transport, so no mail leaves the process — opt out
// of the delivery guards so the real send path can be exercised.
process.env.EMAIL_BYPASS_DELIVERY_GUARDS = "1";

const { isEmailConfigured, sendEmail } = await import("../lib/email/provider");

// Same honest-gating pattern as Phase 4's AI provider tests.
describe("email provider (forced-unconfigured environment)", () => {
  const createdLogIds: string[] = [];

  afterEach(async () => {
    if (createdLogIds.length) {
      await prisma.emailLog.deleteMany({ where: { id: { in: createdLogIds } } });
      createdLogIds.length = 0;
    }
  });

  it("isEmailConfigured() is false", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("sendEmail returns notConfigured and logs a NOT_CONFIGURED EmailLog row", async () => {
    const to = `test-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Test subject", html: "<p>hi</p>", text: "hi" });
    expect(result).toEqual({ ok: false, notConfigured: true });

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log).not.toBeNull();
    expect(log?.status).toBe("NOT_CONFIGURED");
    if (log) createdLogIds.push(log.id);
  });
});

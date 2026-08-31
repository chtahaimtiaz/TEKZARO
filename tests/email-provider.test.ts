import { describe, it, expect, afterEach } from "vitest";
import { isEmailConfigured, sendEmail } from "../lib/email/provider";
import { prisma } from "../lib/prisma";

// Real environment: SMTP_HOST/PORT/USER/PASS are genuinely unset here (see
// .env) — same honest-gating pattern as Phase 4's AI provider tests.
describe("email provider (real, unconfigured environment)", () => {
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

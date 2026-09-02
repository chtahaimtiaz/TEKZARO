import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "../lib/prisma";

// Hoisted above imports by vitest's transform — the static import of
// lib/email/provider below sees this mocked nodemailer, so no real SMTP
// connection is ever attempted.
const sendMailMock = vi.fn(async () => ({ messageId: "mock-message-id" }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
  },
}));

// Cleared explicitly — real .env now carries a live BREVO_API_KEY, which
// would otherwise take priority over SMTP and route this test's sends
// through the (unmocked) Brevo API branch instead of the mocked
// transporter this file exists to exercise.
delete process.env.BREVO_API_KEY;
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test-user";
process.env.SMTP_PASS = "test-pass";
process.env.SMTP_FROM = "TEKZARO <noreply@tekzaro.test>";

const { isEmailConfigured, sendEmail } = await import("../lib/email/provider");

describe("email provider — configured (mocked SMTP fallback, no real network call)", () => {
  const createdLogIds: string[] = [];

  afterEach(async () => {
    sendMailMock.mockClear();
    if (createdLogIds.length) {
      await prisma.emailLog.deleteMany({ where: { id: { in: createdLogIds } } });
      createdLogIds.length = 0;
    }
  });

  it("isEmailConfigured() is true once all SMTP_* vars are set", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it("sends via the mocked transporter and logs a SENT EmailLog row", async () => {
    const to = `test-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to, subject: "Hello" }));

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SENT");
    if (log) createdLogIds.push(log.id);
  });

  it("logs a FAILED EmailLog row and returns ok:false when the transporter throws", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("Connection refused"));
    const to = `test-fail-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) expect(result.error).toContain("Connection refused");

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("FAILED");
    expect(log?.error).toContain("Connection refused");
    if (log) createdLogIds.push(log.id);
  });
});

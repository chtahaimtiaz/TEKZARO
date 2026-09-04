import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "../lib/prisma";

// Cleared so this file proves RESEND_API_KEY alone is enough to route
// through the Resend branch, with no SMTP_* vars set at all.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "TEKZARO <news@tekzaro.test>";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// This file mocks the transport, so no mail leaves the process — opt out
// of the delivery guards so the real send path can be exercised.
process.env.EMAIL_BYPASS_DELIVERY_GUARDS = "1";

const { isEmailConfigured, sendEmail } = await import("../lib/email/provider");

describe("email provider — Resend HTTP API (mocked fetch, no real network call)", () => {
  const createdLogIds: string[] = [];

  afterEach(async () => {
    fetchMock.mockClear();
    if (createdLogIds.length) {
      await prisma.emailLog.deleteMany({ where: { id: { in: createdLogIds } } });
      createdLogIds.length = 0;
    }
  });

  it("isEmailConfigured() is true from RESEND_API_KEY alone, with no SMTP_* vars set", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it("sends via the Resend API with a bearer token and logs a SENT EmailLog row", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "mock-id" }), { status: 200 }));

    const to = `test-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([to]);
    expect(body.from).toBe("TEKZARO <news@tekzaro.test>");
    expect(body.subject).toBe("Hello");

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SENT");
    if (log) createdLogIds.push(log.id);
  });

  it("logs a FAILED EmailLog row and returns ok:false on a non-2xx Resend response", async () => {
    // The real shape of the unverified-domain rejection, which is the one
    // failure this deployment is actually most likely to hit.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: 403, message: "The gmail.com domain is not verified." }), { status: 403 }),
    );

    const to = `test-fail-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) {
      expect(result.error).toContain("403");
      expect(result.error).toContain("not verified");
    }

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("FAILED");
    expect(log?.error).toContain("403");
    if (log) createdLogIds.push(log.id);
  });
});

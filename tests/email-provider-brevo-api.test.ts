import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "../lib/prisma";

// Cleared so this test file's own SMTP_* assignment below can't accidentally
// matter — BREVO_API_KEY alone should be enough to route through the API
// branch even without any SMTP_* vars set.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
process.env.BREVO_API_KEY = "xkeysib-test-key";
process.env.SMTP_FROM = "TEKZARO <noreply@tekzaro.test>";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { isEmailConfigured, sendEmail } = await import("../lib/email/provider");

describe("email provider — Brevo HTTP API (mocked fetch, no real network call)", () => {
  const createdLogIds: string[] = [];

  afterEach(async () => {
    fetchMock.mockClear();
    if (createdLogIds.length) {
      await prisma.emailLog.deleteMany({ where: { id: { in: createdLogIds } } });
      createdLogIds.length = 0;
    }
  });

  it("isEmailConfigured() is true from BREVO_API_KEY alone, with no SMTP_* vars set", () => {
    expect(isEmailConfigured()).toBe(true);
  });

  it("sends via the Brevo API with the api-key header and logs a SENT EmailLog row", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ messageId: "mock-id" }), { status: 201 }));

    const to = `test-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.headers["api-key"]).toBe("xkeysib-test-key");
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: to }]);
    expect(body.sender).toEqual({ email: "TEKZARO <noreply@tekzaro.test>" });

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SENT");
    if (log) createdLogIds.push(log.id);
  });

  it("logs a FAILED EmailLog row and returns ok:false on a non-2xx Brevo response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid api-key" }), { status: 401 }));

    const to = `test-fail-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Hello", html: "<p>Hi</p>", text: "Hi" });

    expect(result.ok).toBe(false);
    if (!result.ok && "error" in result) expect(result.error).toContain("401");

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("FAILED");
    if (log) createdLogIds.push(log.id);
  });
});

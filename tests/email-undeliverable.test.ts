import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../lib/prisma";
import { isUndeliverableAddress, sendEmail } from "../lib/email/provider";

/**
 * The test suite runs against the production database and generates real
 * notification emails. Every fixture address is @example.com, which no mail
 * system can deliver to — so each attempt earned a 554 rejection from the
 * sending mailbox, and rejections count against sender reputation. One
 * 24-hour window logged 507 failures against 307 successes, at which point
 * genuine notifications to real editors began being rejected too.
 *
 * Two guards, both in sendEmail so nothing can bypass them: reserved
 * addresses are never attempted, and a test run never puts traffic on the
 * production mailbox even for a real address.
 */
describe("undeliverable address detection", () => {
  it("recognises RFC 2606 reserved domains", () => {
    for (const a of [
      "someone@example.com",
      "SOMEONE@EXAMPLE.COM",
      "x@example.net",
      "x@example.org",
      "e2e-admin-1788454746008-843145@example.com",
    ]) {
      expect(isUndeliverableAddress(a), a).toBe(true);
    }
  });

  it("recognises reserved TLDs", () => {
    for (const a of ["x@tekzaro.test", "x@host.invalid", "x@localhost", "x@foo.localhost"]) {
      expect(isUndeliverableAddress(a), a).toBe(true);
    }
  });

  it("treats real addresses as deliverable", () => {
    for (const a of [
      "editorial@tekzaro.co",
      "admin@tekzaro.co",
      "reader@gmail.com",
      "someone@examples.com", // not the reserved domain
      "someone@myexample.com",
    ]) {
      expect(isUndeliverableAddress(a), a).toBe(false);
    }
  });

  it("rejects malformed input rather than trying to send it", () => {
    expect(isUndeliverableAddress("not-an-address")).toBe(true);
    expect(isUndeliverableAddress("")).toBe(true);
  });
});

describe("sendEmail skips instead of failing", () => {
  const created: string[] = [];
  afterEach(async () => {
    if (created.length) {
      await prisma.emailLog.deleteMany({ where: { id: { in: created } } });
      created.length = 0;
    }
  });

  it("logs SKIPPED, not FAILED, for a reserved address", async () => {
    const to = `guard-${Date.now()}@example.com`;
    const result = await sendEmail({ to, subject: "Guard", html: "<p>x</p>", text: "x" });

    expect(result.ok).toBe(false);
    expect("skipped" in result && result.skipped).toBe(true);

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SKIPPED");
    // The distinction that matters: this must not inflate the failure count
    // that a real delivery problem would show up in.
    expect(log?.status).not.toBe("FAILED");
    if (log) created.push(log.id);
  });

  it("skips a real address too while the suite is running", async () => {
    // This very assertion is the proof: were the guard absent, running this
    // file would send an actual email to the newsroom mailbox.
    expect(process.env.VITEST).toBeTruthy();

    const to = "editorial@tekzaro.co";
    const result = await sendEmail({ to, subject: `Guard ${Date.now()}`, html: "<p>x</p>", text: "x" });

    expect(result.ok).toBe(false);
    expect("skipped" in result && result.skipped).toBe(true);

    const log = await prisma.emailLog.findFirst({ where: { to }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SKIPPED");
    if (log) created.push(log.id);
  });
});

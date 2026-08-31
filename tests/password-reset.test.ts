import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { createPasswordResetToken, consumePasswordResetToken } from "../lib/password-reset";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

afterAll(cleanupTestData);

describe("password reset / invite tokens", () => {
  it("only stores a hash — the raw token isn't recoverable from the DB row", async () => {
    const user = await createTestUser("REPORTER", "reset-hash");
    trackUser(user.id);

    const { rawToken } = await createPasswordResetToken(user.id, "RESET");
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });

    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(rawToken);
  });

  it("consumes a valid token exactly once", async () => {
    const user = await createTestUser("REPORTER", "reset-once");
    trackUser(user.id);

    const { rawToken } = await createPasswordResetToken(user.id, "RESET");

    const first = await consumePasswordResetToken(rawToken);
    expect(first).toEqual({ userId: user.id, purpose: "RESET" });

    const second = await consumePasswordResetToken(rawToken);
    expect(second).toBeNull();
  });

  it("rejects an expired token", async () => {
    const user = await createTestUser("REPORTER", "reset-expired");
    trackUser(user.id);

    const { rawToken } = await createPasswordResetToken(user.id, "RESET");
    // Force it into the past directly — createPasswordResetToken doesn't
    // expose a custom TTL, so backdate the row for this test.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await consumePasswordResetToken(rawToken)).toBeNull();
  });

  it("rejects a bogus token", async () => {
    expect(await consumePasswordResetToken("not-a-real-token")).toBeNull();
  });

  it("under a simulated concurrent double-claim, only one caller succeeds", async () => {
    const user = await createTestUser("REPORTER", "reset-race");
    trackUser(user.id);

    const { rawToken } = await createPasswordResetToken(user.id, "INVITE");

    const [a, b] = await Promise.all([
      consumePasswordResetToken(rawToken),
      consumePasswordResetToken(rawToken),
    ]);
    const successes = [a, b].filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { hashPassword, verifyPassword, isLockedOut, recordFailedLogin, resetFailedLogins } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { createTestUser, trackUser, cleanupTestData } from "./helpers";

describe("password hashing", () => {
  it("hashes and verifies correctly, and rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("login lockout", () => {
  afterAll(cleanupTestData);

  it("locks the account after 5 failed attempts and resets on success", async () => {
    const user = await createTestUser("REPORTER", "lockout");
    trackUser(user.id);

    expect(await isLockedOut(user)).toBe(false);

    let attempts = user.failedLoginAttempts;
    for (let i = 0; i < 5; i++) {
      await recordFailedLogin(user.id, attempts);
      attempts += 1;
    }

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginAttempts).toBe(5);
    expect(await isLockedOut(locked)).toBe(true);

    await resetFailedLogins(user.id);
    const reset = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reset.failedLoginAttempts).toBe(0);
    expect(await isLockedOut(reset)).toBe(false);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import { createSession, getSessionUser, destroySession, SESSION_COOKIE } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { createTestUser, trackUser, clearSession, cleanupTestData } from "./helpers";
import { mockCookieStore } from "./setup";

describe("session lifecycle", () => {
  afterAll(async () => {
    clearSession();
    await cleanupTestData();
  });

  it("createSession -> getSessionUser resolves the same user, destroySession clears it", async () => {
    const user = await createTestUser("EDITOR", "session");
    trackUser(user.id);

    await createSession(user.id);
    const resolved = await getSessionUser();
    expect(resolved?.id).toBe(user.id);
    expect(resolved).not.toHaveProperty("passwordHash");

    await destroySession();
    expect(await getSessionUser()).toBeNull();
  });

  it("rejects an expired session and cleans it up", async () => {
    const user = await createTestUser("EDITOR", "expired");
    trackUser(user.id);

    const token = "expired-test-token-" + Math.random().toString(36).slice(2);
    const tokenHash = createHmac("sha256", process.env.AUTH_SECRET!).update(token).digest("hex");
    const session = await prisma.session.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    mockCookieStore.set(SESSION_COOKIE, token);

    expect(await getSessionUser()).toBeNull();
    const stillThere = await prisma.session.findUnique({ where: { id: session.id } });
    expect(stillThere).toBeNull(); // expired session is deleted on lookup

    clearSession();
  });

  it("rejects a session for a deactivated user", async () => {
    const user = await createTestUser("EDITOR", "inactive");
    trackUser(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    await createSession(user.id);
    expect(await getSessionUser()).toBeNull();
    clearSession();
  });
});

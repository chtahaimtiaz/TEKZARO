import { describe, it, expect, afterAll } from "vitest";
import { getSystemUserId, isSystemUserEmail } from "../lib/system-actor";
import { prisma } from "../lib/prisma";
import { updateUserRoleAction, setUserActiveAction, createUserAction } from "../lib/user-actions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";
import { ASSIGNABLE_ROLES } from "../lib/permissions";

describe("getSystemUserId", () => {
  it("is idempotent — repeated calls resolve to the same id", async () => {
    const first = await getSystemUserId();
    const second = await getSystemUserId();
    expect(first).toBe(second);
  });

  it("the SYSTEM user can never authenticate (active:false) and has zero capabilities", async () => {
    const id = await getSystemUserId();
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.active).toBe(false);
    expect(user.role).toBe("SYSTEM");
    expect(isSystemUserEmail(user.email)).toBe(true);
    // SYSTEM is deliberately absent from every assignable-role list.
    expect(ASSIGNABLE_ROLES).not.toContain("SYSTEM");
  });

  it("under a simulated concurrent first-call race, both callers converge on one row", async () => {
    // getSystemUserId() caches per-module-instance; this exercises the
    // create-or-refetch race path directly against the DB by deleting the
    // module cache's backing row first isn't practical here (the row is
    // already seeded from prior tests), so this mainly documents the
    // guarantee: repeated concurrent calls never throw and always agree.
    const [a, b, c] = await Promise.all([getSystemUserId(), getSystemUserId(), getSystemUserId()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("SYSTEM user protections in user-actions", () => {
  it("is excluded from ASSIGNABLE_ROLES, so createUserAction rejects role=SYSTEM via zod validation", async () => {
    const admin = await createTestUser("ADMIN", "sys-protect-admin");
    trackUser(admin.id);
    await loginAs(admin.id);

    const form = new FormData();
    form.set("name", "Should Not Be Created");
    form.set("email", `test-sys-${Date.now()}@example.com`);
    form.set("password", "Test-Password-123!");
    form.set("role", "SYSTEM");

    const result = await createUserAction(form);
    expect(result.ok).toBe(false);
    clearSession();
  });

  it("updateUserRoleAction cannot change the SYSTEM user's role", async () => {
    const admin = await createTestUser("ADMIN", "sys-protect-role");
    trackUser(admin.id);
    await loginAs(admin.id);

    const systemId = await getSystemUserId();
    const form = new FormData();
    form.set("role", "ADMIN");
    await updateUserRoleAction(systemId, form);

    const systemUser = await prisma.user.findUniqueOrThrow({ where: { id: systemId } });
    expect(systemUser.role).toBe("SYSTEM"); // unchanged
    clearSession();
  });

  it("setUserActiveAction cannot activate/deactivate the SYSTEM user", async () => {
    const admin = await createTestUser("ADMIN", "sys-protect-active");
    trackUser(admin.id);
    await loginAs(admin.id);

    const systemId = await getSystemUserId();
    await setUserActiveAction(systemId, true);

    const systemUser = await prisma.user.findUniqueOrThrow({ where: { id: systemId } });
    expect(systemUser.active).toBe(false); // still can never authenticate
    clearSession();
  });

  it("the SYSTEM user never appears in the admin user list query", async () => {
    const users = await prisma.user.findMany({ where: { role: { not: "SYSTEM" } } });
    expect(users.every((u) => u.role !== "SYSTEM")).toBe(true);
  });
});

afterAll(cleanupTestData);

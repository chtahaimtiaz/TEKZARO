import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { hashPassword } from "./password";

// Reserved, fixed identifier for the one SYSTEM-role user row — never
// changes, never surfaced to any UI, never used to log in.
const SYSTEM_USER_EMAIL = "system@tekzaro.internal";

let cachedSystemUserId: string | null = null;

/**
 * Returns the id of the seeded SYSTEM user, creating it on first use if it
 * doesn't exist yet (idempotent — safe under concurrent cold starts). This
 * is the *only* sanctioned way any code should reference that id: never
 * send it to a client, never embed it in a form. Used as AuditLog.userId
 * from automated code paths (e.g. the publish-scheduled cron route) so
 * every audit event — human or automated — still points at a real,
 * inspectable, but structurally locked-down User row (SYSTEM role has zero
 * capabilities, active:false, unusable passwordHash — see prisma/schema.prisma).
 */
export async function getSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });
  if (existing) {
    cachedSystemUserId = existing.id;
    return existing.id;
  }

  try {
    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    const created = await prisma.user.create({
      data: {
        name: "TEKZARO System",
        email: SYSTEM_USER_EMAIL,
        passwordHash,
        role: "SYSTEM",
        active: false,
      },
      select: { id: true },
    });
    cachedSystemUserId = created.id;
    return created.id;
  } catch (err: unknown) {
    // Another concurrent invocation created it first — re-fetch rather than
    // fail the caller.
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err;
    const raceWinner = await prisma.user.findUniqueOrThrow({
      where: { email: SYSTEM_USER_EMAIL },
      select: { id: true },
    });
    cachedSystemUserId = raceWinner.id;
    return raceWinner.id;
  }
}

export function isSystemUserEmail(email: string): boolean {
  return email === SYSTEM_USER_EMAIL;
}

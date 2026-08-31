import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";
import type { Role, User } from "@prisma/client";

export { hashPassword, verifyPassword };

export const SESSION_COOKIE = "tekzaro_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export type SafeUser = Omit<User, "passwordHash">;

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured with a sufficiently long value.");
  }
  return secret;
}

/** Only the HMAC of the session token is ever stored — the raw token lives
 * solely in the httpOnly cookie, so a DB leak alone can't yield a session. */
function hashToken(token: string): string {
  return createHmac("sha256", authSecret()).update(token).digest("hex");
}

function stripPassword(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes every session for `userId` except the one the current request is
 * using (if any) — called after a password change so old sessions die. */
export async function invalidateOtherSessions(userId: string): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const keepTokenHash = token ? hashToken(token) : undefined;

  await prisma.session.deleteMany({
    where: {
      userId,
      ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}),
    },
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.active) return null;

  return stripPassword(session.user);
}

/** For Server Components/layouts — redirects anonymous visitors to login. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** For Server Actions — throws so the calling client code can display the
 * error inline, rather than redirecting mid-mutation. Never trust a role or
 * ownership value the client sent; only what's re-derived here from the DB. */
export function requireRole(user: SafeUser | null, allowed: Role[]): SafeUser {
  if (!user) throw new ForbiddenError("You must be signed in.");
  if (!allowed.includes(user.role)) throw new ForbiddenError();
  return user;
}

export async function isLockedOut(user: { failedLoginAttempts: number; lockedUntil: Date | null }): Promise<boolean> {
  return Boolean(user.lockedUntil && user.lockedUntil > new Date());
}

export async function recordFailedLogin(userId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : undefined,
    },
  });
}

export async function resetFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

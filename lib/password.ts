// Pure bcrypt/HMAC wrappers with no Next.js-specific imports — safe to use
// from standalone scripts (scripts/create-admin.ts, scripts/mint-reset-token.ts)
// as well as from lib/auth.ts, which re-exports these but also pulls in
// next/headers and is marked server-only (real Next.js server code only,
// never a plain Node/tsx script — importing it from a script throws, since
// the "server-only" package's whole trick relies on Next's bundler).
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured with a sufficiently long value.");
  }
  return secret;
}

/** Generic HMAC-SHA256(AUTH_SECRET) hash for any opaque bearer token stored
 * in the DB (sessions, password-reset/invite links) — a DB leak alone never
 * yields a usable token, since only the hash is ever persisted. */
export function hashOpaqueToken(token: string): string {
  return createHmac("sha256", authSecret()).update(token).digest("hex");
}

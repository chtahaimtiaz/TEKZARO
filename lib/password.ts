// Pure bcrypt wrappers with no Next.js-specific imports — safe to use from
// standalone scripts (scripts/create-admin.ts) as well as from lib/auth.ts,
// which re-exports these but also pulls in next/headers and is marked
// server-only (real Next.js server code only, never a plain Node script).
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

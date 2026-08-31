import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { hashOpaqueToken } from "./password";
import type { PasswordResetPurpose } from "@prisma/client";

// Deliberately NOT "server-only" and imports from ./password (not ./auth) —
// scripts/mint-reset-token.ts (a plain tsx script, not a Next.js request)
// needs to call createPasswordResetToken directly; ./auth pulls in
// next/headers and the "server-only" package, both of which throw outside
// a real Next.js request. lib/prisma.ts is itself script-safe already
// (scripts/create-admin.ts has used it the same way since Phase 3).

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Creates a single-use, hashed-at-rest token (same pattern as
 * Session.tokenHash) for an invite or admin-triggered reset link. Returns
 * the raw token — the only place it ever exists outside this call is the
 * email/one-time-reveal it gets embedded into; the DB only ever stores its hash. */
export async function createPasswordResetToken(
  userId: string,
  purpose: PasswordResetPurpose,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (purpose === "INVITE" ? INVITE_TTL_MS : RESET_TTL_MS));

  await prisma.passwordResetToken.create({
    data: { userId, purpose, tokenHash: hashOpaqueToken(rawToken), expiresAt },
  });

  return { rawToken, expiresAt };
}

/**
 * Atomically claims a token — a single conditional `updateMany` (same
 * compare-and-swap idea as the cron publish route's idempotency guard)
 * ensures a token can be consumed exactly once even under a concurrent
 * double-submit: only the request whose `updateMany` actually flips
 * `usedAt` from null gets `count:1` and proceeds.
 */
export async function consumePasswordResetToken(
  rawToken: string,
): Promise<{ userId: string; purpose: PasswordResetPurpose } | null> {
  const tokenHash = hashOpaqueToken(rawToken);

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  const result = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (result.count !== 1) return null;

  return { userId: record.userId, purpose: record.purpose };
}

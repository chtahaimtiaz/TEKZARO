import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { hashOpaqueToken } from "./password";

// Deliberately not "server-only" and imports from ./password (not ./auth) —
// same reasoning as lib/password-reset.ts: keeps this script-safe (usable
// from a plain tsx script during testing, not just inside a Next.js request).

const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours — longer than the
// password-reset window; confirmation emails realistically sit unread longer.

/** Same hash-only, single-use pattern as lib/password-reset.ts, pointed at
 * NewsletterSubscriber instead of User (PasswordResetToken's userId FK
 * can't be reused — subscribers aren't users). */
export async function createConfirmationToken(subscriberId: string): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);

  await prisma.newsletterConfirmationToken.create({
    data: { subscriberId, tokenHash: hashOpaqueToken(rawToken), expiresAt },
  });

  return { rawToken, expiresAt };
}

/** Atomic compare-and-swap claim — only the caller whose `updateMany`
 * actually flips `usedAt` from null gets `count:1` and a real result, so a
 * token can be consumed exactly once even under a concurrent double-submit. */
export async function consumeConfirmationToken(rawToken: string): Promise<{ subscriberId: string } | null> {
  const tokenHash = hashOpaqueToken(rawToken);

  const record = await prisma.newsletterConfirmationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  const result = await prisma.newsletterConfirmationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (result.count !== 1) return null;

  return { subscriberId: record.subscriberId };
}

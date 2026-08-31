import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { mockCookieStore, mockHeadersStore } from "./setup";
import type { Role } from "@prisma/client";

export function setMockHeader(name: string, value: string): void {
  mockHeadersStore.set(name.toLowerCase(), value);
}
export function clearMockHeaders(): void {
  mockHeadersStore.clear();
}

const SESSION_COOKIE = "tekzaro_session";

export function uniqueEmail(label: string): string {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function createTestUser(role: Role, label = role.toLowerCase()) {
  const passwordHash = await hashPassword("Test-Password-123!");
  return prisma.user.create({
    data: { name: `Test ${label}`, email: uniqueEmail(label), passwordHash, role },
  });
}

/** Mimics createSession() but writes the token straight into the shared mock
 * cookie store instead of a real Next.js response cookie. */
export async function loginAs(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHmac("sha256", process.env.AUTH_SECRET!).update(token).digest("hex");
  await prisma.session.create({
    data: { tokenHash, userId, expiresAt: new Date(Date.now() + 60_000) },
  });
  mockCookieStore.set(SESSION_COOKIE, token);
}

export function clearSession(): void {
  mockCookieStore.clear();
}

/** Every ID this test run created, so afterAll can clean up regardless of
 * which test created it. */
const createdArticleIds = new Set<string>();
const createdUserIds = new Set<string>();

export function trackArticle(id: string) {
  createdArticleIds.add(id);
}
export function trackUser(id: string) {
  createdUserIds.add(id);
}

export async function cleanupRateLimitKey(key: string): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { key } });
}

/** Server Actions that call next/navigation's redirect() throw (per the
 * mock in tests/setup.ts) rather than actually redirecting outside a real
 * Next.js request — this captures that and returns the target URL so tests
 * can assert on it without a running server. */
export async function captureRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NEXT_REDIRECT:")) return message.slice("NEXT_REDIRECT:".length);
    throw err;
  }
  throw new Error("Expected a redirect, but the function returned normally.");
}

// Minimal, hand-built valid image byte buffers for lib/images/sniff.ts and
// anything downstream of it — deliberately just enough real header
// structure to be genuinely valid (not just magic bytes), no full encoder
// needed for a format this simple to construct by hand.

export function buildMinimalPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8); // IHDR chunk length (unchecked by the sniffer, included for realism)
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

export function buildMinimalGif(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write("GIF89a", 0, "ascii");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

export function buildMinimalJpeg(width: number, height: number): Buffer {
  const buf = Buffer.alloc(11);
  buf.set([0xff, 0xd8, 0xff, 0xc0], 0); // SOI, then an SOF0 marker
  buf.writeUInt16BE(17, 4); // segment length (unchecked — SOF is returned as soon as it's found)
  buf.writeUInt8(8, 6); // sample precision
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

export function buildMinimalWebpVP8X(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(22, 4); // RIFF chunk size (unchecked, included for realism)
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16); // VP8X chunk size
  // byte 20: flags, bytes 21-23: reserved — left zeroed
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

export async function cleanupTestData(): Promise<void> {
  if (createdArticleIds.size) {
    // ArticleVersion/ArticleTag/ArticleSource/Relation rows cascade with the article.
    await prisma.article.deleteMany({ where: { id: { in: [...createdArticleIds] } } });
    createdArticleIds.clear();
  }
  if (createdUserIds.size) {
    const userIds = [...createdUserIds];
    // AuditLog/ArticleVersion.editor reference User without cascade delete —
    // clear those first so the FK constraint doesn't block user cleanup.
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.articleVersion.deleteMany({ where: { editorId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.aIGeneration.deleteMany({ where: { requestedById: { in: userIds } } });
    await prisma.claim.deleteMany({ where: { createdById: { in: userIds } } });
    // Phase 5 additions with a non-cascading FK to User.
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.media.deleteMany({ where: { uploadedById: { in: userIds } } });
    await prisma.newsletterCampaign.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.digest.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.digestItem.deleteMany({ where: { addedById: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    createdUserIds.clear();
  }
}

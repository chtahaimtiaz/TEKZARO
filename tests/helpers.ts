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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { createArticleAction, type ArticleFormInput } from "../lib/article-actions";
import { GET as publishScheduled } from "../app/api/cron/publish-scheduled/route";
import { createTestUser, loginAs, clearSession, trackArticle, trackUser, cleanupTestData, cleanupRateLimitKey } from "./helpers";
import { slugify } from "../lib/slugify";

let categoryId: string;
let authorId: string;

function baseInput(title: string): ArticleFormInput {
  return {
    title,
    slug: slugify(title),
    subheadline: "",
    excerpt: "A test excerpt used for the SEO check.",
    blocks: [{ type: "paragraph", text: "Real article body text for testing." }],
    pakistanImpact: "",
    categoryId,
    authorId,
    tagNames: [],
    locationName: "",
    featuredImageUrl: "https://example.com/image.jpg",
    featuredImageAlt: "Alt text",
    featuredImageCaption: "",
    featuredImageCredit: "",
    featuredMediaId: "",
    seoTitle: "",
    metaDescription: "A test meta description long enough to pass the check.",
    canonicalUrl: "",
    ogImage: "",
    isBreaking: false,
    featured: false,
    pakistanRelevance: 0,
    regionalRelevance: 0,
    globalSignificance: 0,
    scheduledAt: "",
    overrideAuthorEligibility: false,
  };
}

async function makeDueScheduledArticle(label: string) {
  const reporter = await createTestUser("REPORTER", label);
  trackUser(reporter.id);
  await loginAs(reporter.id);

  const created = await createArticleAction(baseInput(`Cron Test Article ${label} ${Date.now()}`));
  if (!created.ok || !created.data) throw new Error(`Failed to create test article: ${created.error}`);
  trackArticle(created.data.id);

  await prisma.article.update({
    where: { id: created.data.id },
    data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 60_000) },
  });

  clearSession();
  return created.data.id;
}

function makeRequest(auth: string | null): NextRequest {
  const headers = new Headers();
  if (auth !== null) headers.set("authorization", auth);
  return new NextRequest("http://localhost/api/cron/publish-scheduled", { headers });
}

beforeAll(async () => {
  // Dedicated fixtures, not an arbitrary findFirstOrThrow() pick — this
  // suite runs concurrently with other test files that create/delete their
  // own temporary Category/Author rows, and an unowned findFirstOrThrow()
  // here can land on one of THOSE rows and go stale (or form a mismatched
  // category/author pairing) mid-run. "ZZZ" prefix is a harmless legacy
  // precaution from when processVerificationBatch's fallback was
  // alphabetical — see the matching note in tests/article-media.test.ts.
  // The Author is restricted to this file's
  // own category (not a generalist) for the same cross-file-collision
  // reason — see tests/discovery-ai-draft.test.ts.
  const category = await prisma.category.create({
    data: { name: `ZZZ Cron Publish Test Cat ${Date.now()}`, slug: `zzz-cron-publish-test-cat-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: {
      name: `Cron Publish Test Author ${Date.now()}`,
      slug: `cron-publish-test-author-${Date.now()}`,
      categories: { connect: [{ id: categoryId }] },
    },
  });
  authorId = author.id;
  // getClientIp() resolves to "unknown" outside a real request in tests, so
  // every call in this file shares one rate-limit key — clear it first so
  // repeated local test runs within the same 10-minute window don't trip
  // the cron route's own rate limiter.
  await cleanupRateLimitKey("cron-publish:unknown");
});

afterAll(async () => {
  clearSession();
  await cleanupTestData();
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  await cleanupRateLimitKey("cron-publish:unknown");
});

describe("GET /api/cron/publish-scheduled", () => {
  it("rejects a request with no/incorrect bearer token", async () => {
    const res1 = await publishScheduled(makeRequest(null));
    expect(res1.status).toBe(401);

    const res2 = await publishScheduled(makeRequest("Bearer wrong-secret"));
    expect(res2.status).toBe(401);
  });

  it("publishes a due SCHEDULED article and records audit/version/notification", async () => {
    const articleId = await makeDueScheduledArticle("cron-publish");

    const res = await publishScheduled(makeRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.published).toBeGreaterThanOrEqual(1);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("PUBLISHED");
    expect(article.publishedAt).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityType: "Article", entityId: articleId, action: "article_published" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.metadata).toMatchObject({ trigger: "cron" });

    const version = await prisma.articleVersion.findFirst({
      where: { articleId, status: "PUBLISHED" },
      orderBy: { versionNumber: "desc" },
    });
    expect(version).not.toBeNull();

    const notification = await prisma.notification.findFirst({
      where: { userId: article.createdById!, type: "article_published" },
    });
    expect(notification).not.toBeNull();
  });

  it("is idempotent under a simulated concurrent double-invocation — only one publish/audit/notification results", async () => {
    const articleId = await makeDueScheduledArticle("cron-race");

    const [res1, res2] = await Promise.all([
      publishScheduled(makeRequest(`Bearer ${process.env.CRON_SECRET}`)),
      publishScheduled(makeRequest(`Bearer ${process.env.CRON_SECRET}`)),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.status).toBe("PUBLISHED");

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: "Article", entityId: articleId, action: "article_published" },
    });
    expect(auditLogs).toHaveLength(1);

    const notifications = await prisma.notification.findMany({
      where: { userId: article.createdById!, type: "article_published" },
    });
    expect(notifications).toHaveLength(1);
  });

  it("does not touch an article that isn't due yet", async () => {
    const reporter = await createTestUser("REPORTER", "cron-not-due");
    trackUser(reporter.id);
    await loginAs(reporter.id);
    const created = await createArticleAction(baseInput(`Cron Not Due ${Date.now()}`));
    if (!created.ok || !created.data) throw new Error("setup failed");
    trackArticle(created.data.id);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.article.update({ where: { id: created.data.id }, data: { status: "SCHEDULED", scheduledAt: future } });
    clearSession();

    await publishScheduled(makeRequest(`Bearer ${process.env.CRON_SECRET}`));

    const article = await prisma.article.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(article.status).toBe("SCHEDULED");
  });
});

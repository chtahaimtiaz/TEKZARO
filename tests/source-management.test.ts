import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fetchAllSourcesAction, deleteSourceAction } from "../lib/source-actions";
import { prisma } from "../lib/prisma";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";

const createdSourceIds: string[] = [];
let categoryId: string;
let authorId: string;

// fetchAllSourcesAction queries every active eligible source system-wide —
// same shared-DB isolation concern as tests/cron-ingest-news.test.ts.
// Deactivate every other active eligible source for the duration of this
// file's Fetch All test, restore afterward.
let deactivatedSourceIds: string[] = [];

async function makeInactiveTestSource(name: string, feedUrl: string) {
  const source = await prisma.source.create({
    data: { name: `${name} ${Date.now()}-${Math.random()}`, url: "https://source-mgmt-test.test", feedUrl, type: "RSS", tier: "TIER_3", active: false },
  });
  createdSourceIds.push(source.id);
  return source;
}

async function asAdmin() {
  const admin = await createTestUser("ADMIN", "source-management");
  trackUser(admin.id);
  await loginAs(admin.id);
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Source Mgmt Test Category ${Date.now()}`, slug: `source-mgmt-test-category-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: { name: `Source Mgmt Test Author ${Date.now()}`, slug: `source-mgmt-test-author-${Date.now()}` },
  });
  authorId = author.id;
});

afterAll(async () => {
  if (createdSourceIds.length) await prisma.source.deleteMany({ where: { id: { in: createdSourceIds } } });
  if (deactivatedSourceIds.length) {
    await prisma.source.updateMany({ where: { id: { in: deactivatedSourceIds } }, data: { active: true } });
  }
  clearSession();
  await cleanupTestData();
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
});

describe("deleteSourceAction", () => {
  it("rejects an unauthenticated/unauthorized caller", async () => {
    clearSession();
    const source = await makeInactiveTestSource("Unauth Delete Test", "https://source-mgmt-test.test/feed.xml");
    await expect(deleteSourceAction(source.id)).rejects.toThrow();
  });

  it("deletes only the selected source, leaving other sources untouched", async () => {
    await asAdmin();
    const target = await makeInactiveTestSource("Delete Target", "https://source-mgmt-test.test/target.xml");
    const bystander = await makeInactiveTestSource("Delete Bystander", "https://source-mgmt-test.test/bystander.xml");

    const result = await deleteSourceAction(target.id);
    expect(result.ok).toBe(true);

    const targetAfter = await prisma.source.findUnique({ where: { id: target.id } });
    expect(targetAfter).toBeNull();
    const bystanderAfter = await prisma.source.findUnique({ where: { id: bystander.id } });
    expect(bystanderAfter).not.toBeNull();
  });

  it("safely removes a stray source with zero discovery/article history — no source names are hardcoded, this is purely dependency-based", async () => {
    await asAdmin();
    // Mirrors the real "Google"/"Google1" stray-record scenario: a source
    // that exists but has never produced anything article-worthy.
    const stray = await makeInactiveTestSource("Stray Zero-History Source", "https://source-mgmt-test.test/stray.xml");

    const result = await deleteSourceAction(stray.id);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("deleted");

    const after = await prisma.source.findUnique({ where: { id: stray.id } });
    expect(after).toBeNull();
  });

  it("refuses to delete a source with a historical article reference (ArticleSource), and the article survives", async () => {
    await asAdmin();
    const source = await makeInactiveTestSource("Has Article History", "https://source-mgmt-test.test/history.xml");
    const article = await prisma.article.create({
      data: {
        slug: `source-mgmt-history-article-${Date.now()}`,
        title: "Source management history test article",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        authorId,
      },
    });
    await prisma.articleSource.create({ data: { articleId: article.id, sourceId: source.id } });

    try {
      const result = await deleteSourceAction(source.id);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("historical");
      expect(result.message.toLowerCase()).toContain("active/disabled");

      const sourceAfter = await prisma.source.findUnique({ where: { id: source.id } });
      expect(sourceAfter).not.toBeNull();
      const articleAfter = await prisma.article.findUnique({ where: { id: article.id } });
      expect(articleAfter).not.toBeNull();
      expect(articleAfter!.title).toBe(article.title);
    } finally {
      await prisma.articleSource.deleteMany({ where: { articleId: article.id } });
      await prisma.article.delete({ where: { id: article.id } });
    }
  });

  it("refuses to delete a source whose SourceItem was converted into a real article, even without an ArticleSource row", async () => {
    await asAdmin();
    const source = await makeInactiveTestSource("Has Converted Item", "https://source-mgmt-test.test/converted.xml");
    const article = await prisma.article.create({
      data: {
        slug: `source-mgmt-converted-article-${Date.now()}`,
        title: "Source management converted-item test article",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "DRAFT",
        categoryId,
        authorId,
      },
    });
    const item = await prisma.sourceItem.create({
      data: {
        sourceId: source.id,
        sourceUrl: `https://source-mgmt-test.test/converted-item-${Date.now()}`,
        headline: "Converted item headline",
        normalizedTitle: "converted item headline",
        status: "CONVERTED_TO_DRAFT",
        convertedArticleId: article.id,
      },
    });

    try {
      const result = await deleteSourceAction(source.id);
      expect(result.ok).toBe(false);

      const sourceAfter = await prisma.source.findUnique({ where: { id: source.id } });
      expect(sourceAfter).not.toBeNull();
    } finally {
      await prisma.sourceItem.delete({ where: { id: item.id } });
      await prisma.article.delete({ where: { id: article.id } });
    }
  });
});

describe("fetchAllSourcesAction", () => {
  it("rejects an unauthenticated/unauthorized caller", async () => {
    clearSession();
    await expect(fetchAllSourcesAction()).rejects.toThrow();
  });

  it("processes every eligible active source independently — one failure never aborts the batch — and reports useful statistics", async () => {
    await asAdmin();

    const otherActiveSources = await prisma.source.findMany({
      where: { active: true, OR: [{ feedUrl: { not: null } }, { type: "GOOGLE_NEWS" }] },
      select: { id: true },
    });
    deactivatedSourceIds = otherActiveSources.map((s) => s.id);
    if (deactivatedSourceIds.length) {
      await prisma.source.updateMany({ where: { id: { in: deactivatedSourceIds } }, data: { active: false } });
    }

    // .invalid is IANA-reserved (RFC 2606) to never resolve — a real,
    // deterministic DNS-failure path, same pattern as
    // tests/cron-ingest-news.test.ts.
    const bad1 = await prisma.source.create({
      data: { name: `Fetch All Bad 1 ${Date.now()}`, url: "https://x.invalid", feedUrl: "https://fetch-all-bad-1.invalid/feed.xml", type: "RSS", tier: "TIER_3", active: true },
    });
    const bad2 = await prisma.source.create({
      data: { name: `Fetch All Bad 2 ${Date.now()}`, url: "https://x.invalid", feedUrl: "https://fetch-all-bad-2.invalid/feed.xml", type: "RSS", tier: "TIER_3", active: true },
    });
    createdSourceIds.push(bad1.id, bad2.id);

    const summary = await fetchAllSourcesAction();
    expect(summary.sourcesChecked).toBe(2);
    expect(summary.sourcesFailed).toBe(2);
    expect(summary.perSource).toHaveLength(2);
    expect(summary.perSource.every((s) => !s.ok)).toBe(true);

    const after = await prisma.source.findMany({ where: { id: { in: [bad1.id, bad2.id] } }, select: { lastError: true } });
    expect(after.every((s) => s.lastError !== null)).toBe(true);

    await prisma.source.updateMany({ where: { id: { in: deactivatedSourceIds } }, data: { active: true } });
    deactivatedSourceIds = [];
  });
});

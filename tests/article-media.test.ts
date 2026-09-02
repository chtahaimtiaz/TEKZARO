import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { getArticleMediaOptions } from "../lib/article-media";
import { getSystemUserId } from "../lib/system-actor";
import { trackArticle, cleanupTestData } from "./helpers";
import type { Prisma } from "@prisma/client";

let categoryId: string;
let authorId: string;
let sourceId: string;
const createdSourceItemIds: string[] = [];
const createdMediaIds: string[] = [];

afterAll(async () => {
  if (createdMediaIds.length) await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  if (createdSourceItemIds.length) await prisma.sourceItem.deleteMany({ where: { id: { in: createdSourceItemIds } } });
  // cleanupTestData() deletes tracked Articles first — must run before
  // Author/Category are removed, since Article.authorId/categoryId are
  // required (non-cascading) FKs.
  await cleanupTestData();
  if (sourceId) await prisma.source.deleteMany({ where: { id: sourceId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function makeCategoryAuthorSource() {
  if (!categoryId) {
    // "ZZZ" prefix is a harmless legacy precaution: lib/verification-actions.ts's
    // processVerificationBatch used to fall back to an alphabetically-first
    // category for any SourceItem with no categoryId, which could pick up
    // this file's own fixture and create a real, untracked Article
    // referencing it (observed: Article_categoryId_fkey violation blocking
    // this file's cleanup below). That fallback is now scoped to a single
    // reserved "uncategorized" slug (see UNCATEGORIZED_CATEGORY_SLUG), so
    // this can no longer happen regardless of name — kept as-is anyway,
    // since there's no reason to churn a working fixture.
    const category = await prisma.category.create({
      data: { name: `ZZZ Article Media Test Cat ${Date.now()}`, slug: `zzz-article-media-test-cat-${Date.now()}` },
    });
    categoryId = category.id;
  }
  if (!authorId) {
    // Restricted to this file's own dedicated category (not a generalist)
    // so concurrently-running test files' own pickEligibleAuthor() calls
    // can never select this author for one of THEIR articles — that
    // article would be untracked by this file's cleanup and block the
    // author delete below with a dangling FK. See the equivalent note in
    // tests/discovery-ai-draft.test.ts.
    const author = await prisma.author.create({
      data: {
        name: `Article Media Test Author ${Date.now()}`,
        slug: `article-media-test-author-${Date.now()}`,
        categories: { connect: [{ id: categoryId }] },
      },
    });
    authorId = author.id;
  }
  if (!sourceId) {
    const source = await prisma.source.create({
      data: { name: `Article Media Test Source ${Date.now()}`, url: "https://example.com", type: "RSS", tier: "TIER_2" },
    });
    sourceId = source.id;
  }
}

async function makeArticle(): Promise<string> {
  await makeCategoryAuthorSource();
  const article = await prisma.article.create({
    data: {
      slug: `article-media-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Article media test article",
      content: { blocks: [] } as unknown as Prisma.InputJsonValue,
      categoryId,
      authorId,
    },
  });
  trackArticle(article.id);
  return article.id;
}

describe("getArticleMediaOptions", () => {
  it("returns [] for an article with no linked SourceItem (created from scratch, not discovery)", async () => {
    const articleId = await makeArticle();
    expect(await getArticleMediaOptions(articleId)).toEqual([]);
  });

  it("returns [] when the article's SourceItem exists but has no acquired Media", async () => {
    await makeCategoryAuthorSource();
    const articleId = await makeArticle();
    const item = await prisma.sourceItem.create({
      data: {
        sourceId,
        sourceUrl: `https://example.com/no-media-${Date.now()}`,
        headline: "No media item",
        normalizedTitle: "no media item",
        categoryId,
        convertedArticleId: articleId,
      },
    });
    createdSourceItemIds.push(item.id);

    expect(await getArticleMediaOptions(articleId)).toEqual([]);
  });

  it("returns the SourceItem's own Media rows, newest first, with full field mapping — not the whole library", async () => {
    await makeCategoryAuthorSource();
    const articleId = await makeArticle();
    const item = await prisma.sourceItem.create({
      data: {
        sourceId,
        sourceUrl: `https://example.com/with-media-${Date.now()}`,
        headline: "With media item",
        normalizedTitle: "with media item",
        categoryId,
        convertedArticleId: articleId,
      },
    });
    createdSourceItemIds.push(item.id);
    const uploadedById = await getSystemUserId();

    const older = await prisma.media.create({
      data: {
        url: "https://blob.example/older.jpg",
        altText: "Older image",
        filename: "older.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        uploadedById,
        sourceItemId: item.id,
        reuseStatus: "REQUIRES_REVIEW",
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    createdMediaIds.push(older.id);

    const newer = await prisma.media.create({
      data: {
        url: "https://blob.example/newer.jpg",
        altText: "Newer image",
        filename: "newer.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 4096,
        uploadedById,
        sourceItemId: item.id,
        reuseStatus: "ALLOWED",
        sourceDomain: "example.com",
        sourceArticleUrl: "https://example.com/original-story",
        selectionReasons: ["largest candidate", "matched headline keywords"] as unknown as Prisma.InputJsonValue,
      },
    });
    createdMediaIds.push(newer.id);

    // A Media row belonging to a different SourceItem must never leak in —
    // this is the whole point of the picker being article-specific rather
    // than the full media library.
    const otherItem = await prisma.sourceItem.create({
      data: {
        sourceId,
        sourceUrl: `https://example.com/other-${Date.now()}`,
        headline: "Unrelated item",
        normalizedTitle: "unrelated item",
        categoryId,
      },
    });
    createdSourceItemIds.push(otherItem.id);
    const unrelated = await prisma.media.create({
      data: {
        url: "https://blob.example/unrelated.jpg",
        altText: "Unrelated image",
        filename: "unrelated.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById,
        sourceItemId: otherItem.id,
        reuseStatus: "ALLOWED",
      },
    });
    createdMediaIds.push(unrelated.id);

    const result = await getArticleMediaOptions(articleId);

    expect(result.map((m) => m.id)).toEqual([newer.id, older.id]);

    const newerOut = result.find((m) => m.id === newer.id)!;
    expect(newerOut.url).toBe("https://blob.example/newer.jpg");
    expect(newerOut.altText).toBe("Newer image");
    expect(newerOut.reuseStatus).toBe("ALLOWED");
    expect(newerOut.sourceDomain).toBe("example.com");
    expect(newerOut.sourceArticleUrl).toBe("https://example.com/original-story");
    expect(newerOut.selectionReasons).toEqual(["largest candidate", "matched headline keywords"]);

    const olderOut = result.find((m) => m.id === older.id)!;
    expect(olderOut.reuseStatus).toBe("REQUIRES_REVIEW");
    expect(olderOut.sourceDomain).toBeNull();
    expect(olderOut.selectionReasons).toBeNull();
  });

  it("also returns Media manually tagged via articleId, even with no linked SourceItem at all", async () => {
    await makeCategoryAuthorSource();
    const articleId = await makeArticle();
    const uploadedById = await getSystemUserId();

    const tagged = await prisma.media.create({
      data: {
        url: "https://blob.example/manually-tagged.jpg",
        altText: "Manually tagged",
        filename: "manually-tagged.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById,
        articleId,
        reuseStatus: "ALLOWED",
      },
    });
    createdMediaIds.push(tagged.id);

    // Tagged for a DIFFERENT article — must never leak into this one.
    const otherArticleId = await makeArticle();
    const taggedElsewhere = await prisma.media.create({
      data: {
        url: "https://blob.example/tagged-elsewhere.jpg",
        altText: "Tagged elsewhere",
        filename: "tagged-elsewhere.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById,
        articleId: otherArticleId,
        reuseStatus: "ALLOWED",
      },
    });
    createdMediaIds.push(taggedElsewhere.id);

    const result = await getArticleMediaOptions(articleId);
    expect(result.map((m) => m.id)).toEqual([tagged.id]);
  });

  it("combines auto-acquired (SourceItem) and manually-tagged (articleId) media for the same article", async () => {
    await makeCategoryAuthorSource();
    const articleId = await makeArticle();
    const uploadedById = await getSystemUserId();

    const item = await prisma.sourceItem.create({
      data: {
        sourceId,
        sourceUrl: `https://example.com/combined-${Date.now()}`,
        headline: "Combined item",
        normalizedTitle: "combined item",
        categoryId,
        convertedArticleId: articleId,
      },
    });
    createdSourceItemIds.push(item.id);

    const acquired = await prisma.media.create({
      data: {
        url: "https://blob.example/acquired.jpg",
        altText: "Acquired",
        filename: "acquired.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById,
        sourceItemId: item.id,
        reuseStatus: "REQUIRES_REVIEW",
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    createdMediaIds.push(acquired.id);

    const manuallyTagged = await prisma.media.create({
      data: {
        url: "https://blob.example/manual.jpg",
        altText: "Manual",
        filename: "manual.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        uploadedById,
        articleId,
        reuseStatus: "ALLOWED",
      },
    });
    createdMediaIds.push(manuallyTagged.id);

    const result = await getArticleMediaOptions(articleId);
    expect(new Set(result.map((m) => m.id))).toEqual(new Set([acquired.id, manuallyTagged.id]));
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { pickDuplicateKeeper, deduplicateArticles } from "../lib/article-dedup";
import { trackArticle, cleanupTestData } from "./helpers";
import type { Prisma } from "@prisma/client";

describe("pickDuplicateKeeper (pure)", () => {
  const base = { categoryId: "cat-1" };

  it("always keeps a PUBLISHED article over DRAFT/IN_REVIEW siblings, regardless of creation order", () => {
    const draft = { ...base, id: "a", title: "X", status: "DRAFT" as const, createdAt: new Date("2026-01-01") };
    const published = { ...base, id: "b", title: "X", status: "PUBLISHED" as const, createdAt: new Date("2026-01-05") };
    const inReview = { ...base, id: "c", title: "X", status: "IN_REVIEW" as const, createdAt: new Date("2026-01-02") };
    const { keep, remove } = pickDuplicateKeeper([draft, published, inReview]);
    expect(keep.id).toBe("b");
    expect(remove.map((a) => a.id).sort()).toEqual(["a", "c"]);
  });

  it("breaks ties between same-status duplicates by earliest createdAt (the original)", () => {
    const earlier = { ...base, id: "a", title: "X", status: "DRAFT" as const, createdAt: new Date("2026-01-01") };
    const later = { ...base, id: "b", title: "X", status: "DRAFT" as const, createdAt: new Date("2026-01-03") };
    const { keep, remove } = pickDuplicateKeeper([later, earlier]);
    expect(keep.id).toBe("a");
    expect(remove.map((a) => a.id)).toEqual(["b"]);
  });

  it("prefers SCHEDULED over APPROVED over IN_REVIEW over CHANGES_REQUESTED, in that order", () => {
    const statuses = ["CHANGES_REQUESTED", "IN_REVIEW", "APPROVED", "SCHEDULED"] as const;
    const articles = statuses.map((status, i) => ({
      ...base,
      id: status,
      title: "X",
      status,
      createdAt: new Date(2026, 0, i + 1),
    }));
    const { keep } = pickDuplicateKeeper(articles);
    expect(keep.status).toBe("SCHEDULED");
  });

  it("never removes anything when given a single article", () => {
    const only = { ...base, id: "a", title: "X", status: "DRAFT" as const, createdAt: new Date() };
    const { keep, remove } = pickDuplicateKeeper([only]);
    expect(keep.id).toBe("a");
    expect(remove).toEqual([]);
  });
});

describe("deduplicateArticles (integration)", () => {
  let categoryId: string;
  let authorId: string;
  const createdArticleIds: string[] = [];

  afterAll(async () => {
    await cleanupTestData();
    if (createdArticleIds.length) await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
    if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function makeFixtures() {
    if (categoryId) return;
    const category = await prisma.category.create({
      data: { name: `ZZZ Dedup Test Cat ${Date.now()}`, slug: `zzz-dedup-test-cat-${Date.now()}` },
    });
    categoryId = category.id;
    const author = await prisma.author.create({
      data: {
        name: `Dedup Test Author ${Date.now()}`,
        slug: `dedup-test-author-${Date.now()}`,
        categories: { connect: [{ id: categoryId }] },
      },
    });
    authorId = author.id;
  }

  async function makeArticle(title: string, status: "DRAFT" | "PUBLISHED" | "IN_REVIEW", createdAt: Date) {
    const article = await prisma.article.create({
      data: {
        slug: `dedup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content: { blocks: [] } as unknown as Prisma.InputJsonValue,
        status,
        categoryId,
        authorId,
        createdAt,
        publishedAt: status === "PUBLISHED" ? createdAt : null,
      },
    });
    createdArticleIds.push(article.id);
    trackArticle(article.id);
    return article;
  }

  it("removes exact-title duplicates within the same category, keeping only the most-advanced one", async () => {
    await makeFixtures();
    const stamp = Date.now();
    const title = `Dedup Integration Story ${stamp}`;
    const now = new Date();

    const draft1 = await makeArticle(title, "DRAFT", new Date(now.getTime() - 3000));
    const published = await makeArticle(title, "PUBLISHED", new Date(now.getTime() - 2000));
    const draft2 = await makeArticle(title, "DRAFT", new Date(now.getTime() - 1000));

    const result = await deduplicateArticles();
    expect(result.articlesDeleted).toBeGreaterThanOrEqual(2);

    const remaining = await prisma.article.findMany({ where: { id: { in: [draft1.id, published.id, draft2.id] } } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(published.id);

    const auditEntries = await prisma.auditLog.findMany({
      where: { action: "article_deduplicated", entityId: { in: [draft1.id, draft2.id] } },
    });
    expect(auditEntries).toHaveLength(2);
    for (const entry of auditEntries) {
      expect((entry.metadata as { keptArticleId?: string } | null)?.keptArticleId).toBe(published.id);
    }
  });

  it("never touches articles with different titles, even in the same category", async () => {
    await makeFixtures();
    const stamp = Date.now();
    const a = await makeArticle(`Unique Story A ${stamp}`, "DRAFT", new Date());
    const b = await makeArticle(`Unique Story B ${stamp}`, "DRAFT", new Date());

    await deduplicateArticles();

    const stillThere = await prisma.article.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(stillThere).toHaveLength(2);
  });

  it("title matching is case/whitespace-insensitive", async () => {
    await makeFixtures();
    const stamp = Date.now();
    const original = await makeArticle(`Whitespace Case Story ${stamp}`, "PUBLISHED", new Date(Date.now() - 1000));
    // Deliberately messy casing/spacing — deduplicateArticles' own
    // normalization must collapse this to the same key as `original`.
    const dupe = await makeArticle(`  WHITESPACE   Case story ${stamp}  `, "DRAFT", new Date());

    await deduplicateArticles();

    const remaining = await prisma.article.findMany({ where: { id: { in: [original.id, dupe.id] } } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(original.id);
  });
});

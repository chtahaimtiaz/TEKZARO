import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { getLatestPreview, getLatestArchive, getCategoryArticles } from "../lib/articles";
import { editorialScore, selectHero } from "../lib/ranking";
import { computePriorityScore } from "../lib/discovery/priority";
import type { ArticleWithRelations } from "../lib/types";

/**
 * "Just In" must be strictly reverse-chronological. It previously re-sorted
 * a chronological pool by editorialScore, which adds pakistanRelevance * 0.3
 * on top of a recency term that decays to zero over ~50 hours.
 *
 * The two windows where that actually inverted the order — and therefore the
 * two cases worth regression-testing — are:
 *
 *   1. Both articles older than ~50h: recency contributes 0 to each, so the
 *      Pakistan bonus alone decides, and the OLDER Pakistan story wins.
 *   2. Both inside the window but less than 15h apart: recency falls 2/hour,
 *      so the +30 Pakistan bonus outweighs up to 15 hours of newness.
 *
 * Note that the naive case (Pakistan 7 days old vs global 1 hour old) does
 * NOT reproduce the bug — the fresh article scores 98 against 30 and wins
 * even under the old code. Tests built only on that shape would have passed
 * against the broken implementation. Each ordering test below therefore
 * asserts the fix AND separately proves the old scoring would have failed
 * it, so the test can't silently stop testing anything.
 */

const marker = `zzz-justin-${Date.now()}`;
const HOUR = 36e5;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

let categoryId: string;
let pakistanCategoryId: string;
let authorId: string;
const createdArticleIds: string[] = [];

interface Fixture {
  key: string;
  hoursAgo: number;
  pakistanRelevance: number;
  globalSignificance?: number;
  status?: "PUBLISHED" | "DRAFT" | "IN_REVIEW" | "APPROVED" | "SCHEDULED";
  publishedAtOverride?: Date;
  categoryOverride?: string;
}

async function makeArticle(f: Fixture): Promise<string> {
  const slug = `${marker}-${f.key}`;
  const article = await prisma.article.create({
    data: {
      slug,
      title: `ZZZ Just In ${f.key} ${marker}`,
      excerpt: "Ordering fixture.",
      content: { blocks: [{ type: "paragraph", text: "Body." }] },
      status: f.status ?? "PUBLISHED",
      isDemo: false,
      publishedAt: f.publishedAtOverride ?? ago(f.hoursAgo),
      pakistanRelevance: f.pakistanRelevance,
      globalSignificance: f.globalSignificance ?? 0,
      categoryId: f.categoryOverride ?? categoryId,
      authorId,
    },
  });
  createdArticleIds.push(article.id);
  return article.id;
}

/** Returned order, narrowed to this file's fixtures — so unrelated real
 *  articles in the shared database can't make the assertion flaky. */
function orderedKeys(articles: { slug: string }[]): string[] {
  return articles
    .filter((a) => a.slug.startsWith(marker))
    .map((a) => a.slug.slice(marker.length + 1));
}

/** Narrowed further to one test's own fixtures. Fixtures accumulate for the
 *  lifetime of the file, so each test must compare only against the rows it
 *  created — while still reading their relative order from the real query
 *  result, interleaved with everything else. */
function orderAmong(articles: { slug: string }[], keys: string[]): string[] {
  const wanted = new Set(keys);
  return orderedKeys(articles).filter((k) => wanted.has(k));
}

/** The ordering the removed implementation would have produced. */
function oldImplementationOrder(articles: ArticleWithRelations[], keys: string[]): string[] {
  return orderAmong([...articles].sort((a, b) => editorialScore(b) - editorialScore(a)), keys);
}

beforeAll(async () => {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: `ZZZ Just In Cat ${stamp}`, slug: `zzz-just-in-cat-${stamp}` },
  });
  categoryId = category.id;
  const pkCategory = await prisma.category.create({
    data: { name: `ZZZ Just In PK Cat ${stamp}`, slug: `zzz-just-in-pk-cat-${stamp}` },
  });
  pakistanCategoryId = pkCategory.id;

  // Category-restricted so pickEligibleAuthor() can never treat this author
  // as a generalist and attach it to real production articles — the exact
  // way a test author once became a live byline on published content.
  const author = await prisma.author.create({
    data: {
      name: `ZZZ Just In Author ${stamp}`,
      slug: `zzz-just-in-author-${stamp}`,
      categories: { connect: [{ id: categoryId }, { id: pakistanCategoryId }] },
    },
  });
  authorId = author.id;
});

afterAll(async () => {
  if (createdArticleIds.length) {
    await prisma.article.deleteMany({ where: { id: { in: createdArticleIds } } });
  }
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (pakistanCategoryId) await prisma.category.deleteMany({ where: { id: pakistanCategoryId } });
});

describe("Just In — strict chronological ordering", () => {
  it("puts a newer global article above an older Pakistan article, past the recency-decay window", async () => {
    // Both older than ~50h, so the old recency term contributed 0 to each and
    // the Pakistan bonus alone decided the order.
    await makeArticle({ key: "pk-old", hoursAgo: 120, pakistanRelevance: 100 });
    await makeArticle({ key: "global-newer", hoursAgo: 72, pakistanRelevance: 0 });

    const keys = ["global-newer", "pk-old"];
    const latest = await getLatestPreview(100);
    expect(orderAmong(latest, keys)).toEqual(["global-newer", "pk-old"]);

    // Prove this case genuinely catches the regression rather than passing
    // under either implementation.
    expect(oldImplementationOrder(latest, keys)).toEqual(["pk-old", "global-newer"]);
  });

  it("puts a newer global article above an older Pakistan article inside the recency window", async () => {
    // 11 hours apart — less than the ~15h that a +30 Pakistan bonus buys at
    // 2 points of recency decay per hour.
    await makeArticle({ key: "pk-12h", hoursAgo: 12, pakistanRelevance: 100 });
    await makeArticle({ key: "global-1h", hoursAgo: 1, pakistanRelevance: 0 });

    const keys = ["global-1h", "pk-12h"];
    const latest = await getLatestPreview(100);
    expect(orderAmong(latest, keys)).toEqual(["global-1h", "pk-12h"]);
    expect(oldImplementationOrder(latest, keys)).toEqual(["pk-12h", "global-1h"]);
  });

  it("puts a newer Pakistan article above an older global article", async () => {
    // The fix must be chronology, not a swing against Pakistan coverage.
    await makeArticle({ key: "global-2d", hoursAgo: 48, pakistanRelevance: 0, globalSignificance: 100 });
    await makeArticle({ key: "pk-30m", hoursAgo: 0.5, pakistanRelevance: 95 });

    const latest = await getLatestPreview(100);
    expect(orderAmong(latest, ["pk-30m", "global-2d"])).toEqual(["pk-30m", "global-2d"]);
  });

  it("orders a mixed set strictly by publication time", async () => {
    await makeArticle({ key: "m-pk-7d", hoursAgo: 168, pakistanRelevance: 100 });
    await makeArticle({ key: "m-global-5h", hoursAgo: 5, pakistanRelevance: 0, globalSignificance: 80 });
    await makeArticle({ key: "m-regional-2h", hoursAgo: 2, pakistanRelevance: 40 });
    await makeArticle({ key: "m-pk-45m", hoursAgo: 0.75, pakistanRelevance: 90 });
    await makeArticle({ key: "m-global-10m", hoursAgo: 0.17, pakistanRelevance: 0 });

    const expected = ["m-global-10m", "m-pk-45m", "m-regional-2h", "m-global-5h", "m-pk-7d"];
    const latest = await getLatestPreview(100);
    expect(orderAmong(latest, expected)).toEqual(expected);
  });

  it("returns results in genuinely descending publishedAt order", async () => {
    await makeArticle({ key: "seq-a", hoursAgo: 3, pakistanRelevance: 100 });
    await makeArticle({ key: "seq-b", hoursAgo: 2, pakistanRelevance: 0 });
    await makeArticle({ key: "seq-c", hoursAgo: 1, pakistanRelevance: 70 });

    const latest = await getLatestPreview(100);
    const times = latest.map((a) => a.publishedAt?.getTime() ?? 0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });
});

describe("Just In — visibility rules", () => {
  it("excludes every non-published status", async () => {
    await makeArticle({ key: "st-draft", hoursAgo: 0.1, pakistanRelevance: 0, status: "DRAFT" });
    await makeArticle({ key: "st-review", hoursAgo: 0.1, pakistanRelevance: 0, status: "IN_REVIEW" });
    await makeArticle({ key: "st-approved", hoursAgo: 0.1, pakistanRelevance: 0, status: "APPROVED" });
    await makeArticle({ key: "st-scheduled", hoursAgo: 0.1, pakistanRelevance: 0, status: "SCHEDULED" });
    await makeArticle({ key: "st-published", hoursAgo: 0.1, pakistanRelevance: 0, status: "PUBLISHED" });

    const keys = orderedKeys(await getLatestPreview(100));
    expect(keys).toContain("st-published");
    for (const hidden of ["st-draft", "st-review", "st-approved", "st-scheduled"]) {
      expect(keys).not.toContain(hidden);
    }

    const archiveKeys = orderedKeys((await getLatestArchive(1, 100)).articles);
    for (const hidden of ["st-draft", "st-review", "st-approved", "st-scheduled"]) {
      expect(archiveKeys).not.toContain(hidden);
    }
  });

  it("hides a future-dated article until its publication time arrives", async () => {
    await makeArticle({
      key: "future",
      hoursAgo: 0,
      pakistanRelevance: 0,
      publishedAtOverride: new Date(Date.now() + 6 * HOUR),
    });
    await makeArticle({ key: "present", hoursAgo: 0.05, pakistanRelevance: 0 });

    const keys = orderedKeys(await getLatestPreview(100));
    expect(keys).toContain("present");
    expect(keys).not.toContain("future");

    expect(orderedKeys((await getLatestArchive(1, 100)).articles)).not.toContain("future");
  });
});

describe("Just In — pagination", () => {
  it("keeps one descending sequence across a page boundary, with no repeats or gaps", async () => {
    for (let i = 0; i < 6; i++) {
      await makeArticle({
        key: `pg-${i}`,
        hoursAgo: 200 + i, // deliberately old so real content can't interleave
        pakistanRelevance: i % 2 === 0 ? 100 : 0,
      });
    }

    const pageSize = 4;
    const first = await getLatestArchive(1, pageSize);
    const second = await getLatestArchive(2, pageSize);

    const combined = [...first.articles, ...second.articles];
    const ids = combined.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length); // no row on two pages

    const times = combined.map((a) => a.publishedAt?.getTime() ?? 0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }

    // Page 2 must continue below page 1, never restart.
    const lastOfFirst = first.articles.at(-1)?.publishedAt?.getTime() ?? 0;
    const firstOfSecond = second.articles[0]?.publishedAt?.getTime() ?? 0;
    expect(lastOfFirst).toBeGreaterThanOrEqual(firstOfSecond);
  });

  it("orders articles sharing an identical timestamp deterministically across repeated reads", async () => {
    const sameMoment = ago(300);
    for (const key of ["tie-a", "tie-b", "tie-c"]) {
      await makeArticle({ key, hoursAgo: 0, pakistanRelevance: 50, publishedAtOverride: sameMoment });
    }

    const first = orderedKeys((await getLatestArchive(1, 100)).articles);
    const second = orderedKeys((await getLatestArchive(1, 100)).articles);
    expect(first).toEqual(second); // id DESC tie-break makes this stable
  });
});

describe("category pages stay chronological", () => {
  it("orders a category feed by publication time regardless of Pakistan relevance", async () => {
    const stamp = Date.now();
    const cat = await prisma.category.create({
      data: { name: `ZZZ Just In Cat2 ${stamp}`, slug: `zzz-just-in-cat2-${stamp}` },
    });
    try {
      await makeArticle({ key: "cat-pk-old", hoursAgo: 100, pakistanRelevance: 100, categoryOverride: cat.id });
      await makeArticle({ key: "cat-global-new", hoursAgo: 2, pakistanRelevance: 0, categoryOverride: cat.id });

      const { articles } = await getCategoryArticles(cat.slug, 1, 50);
      expect(orderAmong(articles, ["cat-global-new", "cat-pk-old"]))
        .toEqual(["cat-global-new", "cat-pk-old"]);
    } finally {
      await prisma.article.deleteMany({ where: { categoryId: cat.id } });
      await prisma.category.deleteMany({ where: { id: cat.id } });
    }
  });
});

describe("Pakistan-first ranking is preserved where it belongs", () => {
  it("still weights Pakistan relevance in the discovery priority score", () => {
    const base = {
      sourceTier: "TIER_1" as const,
      publishedAt: new Date(),
      corroboratingSourceCount: 0,
      headline: "A technology company announced a new product",
      matchedPriorityKeywords: [],
      techRelevance: { score: 10, matched: ["technology"] } as never,
    };

    const pakistan = computePriorityScore({ ...base, pakistanRelevance: 90 });
    const global = computePriorityScore({ ...base, pakistanRelevance: 0 });

    expect(pakistan.score).toBeGreaterThan(global.score);
    expect(pakistan.reasons.join(" ")).toContain("Pakistan relevance");
  });

  it("still weights Pakistan relevance in the homepage hero selection", () => {
    // selectHero uses editorialScore, which this change deliberately left in
    // place — the hero is an editorial judgement, not a recency feed.
    const mk = (id: string, hoursAgo: number, pakistanRelevance: number) =>
      ({
        id,
        featured: false,
        isBreaking: false,
        pakistanRelevance,
        globalSignificance: 0,
        publishedAt: ago(hoursAgo),
      }) as unknown as ArticleWithRelations;

    // Same age, different relevance — Pakistan coverage must still lead.
    const { main } = selectHero([mk("global", 4, 0), mk("pakistan", 4, 100)]);
    expect(main?.id).toBe("pakistan");
  });

  it("keeps editorialScore itself unchanged in shape", () => {
    const article = {
      isBreaking: false,
      pakistanRelevance: 100,
      globalSignificance: 0,
      publishedAt: ago(1000), // far past the recency decay
    } as unknown as ArticleWithRelations;
    // 100 * 0.3, with recency fully decayed — the exact term that made the
    // old Just In ordering wrong, still intact for the surfaces that want it.
    expect(editorialScore(article)).toBeCloseTo(30, 5);
  });
});

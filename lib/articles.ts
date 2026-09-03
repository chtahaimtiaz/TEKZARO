import "server-only";
import { prisma } from "./prisma";
// editorialScore is deliberately not imported here any more — see
// getLatestPreview. It remains in lib/ranking.ts, still used by selectHero
// for the homepage hero, which keeps its Pakistan-weighted ranking.
import { sortTrending, sortPakistanTrending } from "./ranking";
import type { ArticleWithRelations } from "./types";

export const ARTICLE_INCLUDE = {
  category: true,
  author: true,
  tags: { include: { tag: true } },
  sources: { include: { source: true } },
} as const;

// isDemo: false is load-bearing, not cosmetic — every public query in this
// file goes through this constant. Seeded demo content (prisma/seed.ts) is
// status:"PUBLISHED" like real articles, so without this exclusion demo
// headlines can appear anywhere real news would, including the site-wide
// breaking ticker and homepage hero. Admin surfaces query Article directly
// and intentionally keep showing demo content for reference.
// Exported: lib/editorial-checklist.ts's counting query reuses this exact
// constant rather than re-deriving "what counts as really published."
export const PUBLISHED = { status: "PUBLISHED" as const, isDemo: false };

/**
 * PUBLISHED, plus the guard that the article's publishedAt has actually
 * arrived. Scoped to the "Just In" feeds rather than folded into PUBLISHED
 * itself: every code path that publishes (the workflow transition in
 * lib/article-actions.ts, auto-publish in lib/verification-actions.ts, and
 * the scheduled-publish cron, which flips SCHEDULED -> PUBLISHED and stamps
 * publishedAt at that moment) sets publishedAt to the current time, so a
 * future-dated PUBLISHED row can't arise from the application at all —
 * verified against production, where zero published articles carry a null or
 * future publishedAt. This is defense against a direct DB edit or an import,
 * on the two surfaces that promise recency, and nothing more.
 */
function publiclyVisibleNow() {
  return { ...PUBLISHED, publishedAt: { lte: new Date() } };
}

export async function getBreakingArticles(limit = 6): Promise<ArticleWithRelations[]> {
  return prisma.article.findMany({
    where: { ...PUBLISHED, isBreaking: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: ARTICLE_INCLUDE,
  });
}

/** Pool the hero-selection ranking (lib/ranking.ts) picks the front page from. */
export async function getHeroPool(limit = 16): Promise<ArticleWithRelations[]> {
  return prisma.article.findMany({
    where: PUBLISHED,
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: ARTICLE_INCLUDE,
  });
}

/**
 * "Just In" — the homepage section and /latest below both answer one
 * question: what did TEKZARO publish most recently? So ordering is strictly
 * publishedAt DESC and nothing else.
 *
 * This deliberately does NOT use editorialScore (lib/ranking.ts). That score
 * adds pakistanRelevance * 0.3 on top of a recency term that decays to zero
 * over ~50 hours, so it reordered this section by relevance rather than
 * recency: a Pakistan story could sit above a global one published 15 hours
 * later, and past the 50-hour mark recency stopped contributing at all,
 * leaving week-old Pakistan coverage pinned above today's news. A section
 * labelled "Just In" that isn't chronological is simply mislabelled.
 *
 * Pakistan-first ranking is intentional and untouched everywhere it belongs —
 * the discovery queue, the hero (selectHero), and the Pakistan trending
 * module. It just doesn't belong in a recency feed.
 *
 * id DESC is the tie-break so ordering stays deterministic when two articles
 * share a publishedAt, which matters for pagination in getLatestArchive.
 */
export async function getLatestPreview(limit = 8): Promise<ArticleWithRelations[]> {
  return prisma.article.findMany({
    where: publiclyVisibleNow(),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    include: ARTICLE_INCLUDE,
  });
}

export interface PaginatedArticles {
  articles: ArticleWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Strict reverse-chronological archive, for /latest — the full "Just In"
 * feed behind the homepage preview above, and ordered identically.
 *
 * The where clause is evaluated once and reused for both the page query and
 * the count: publiclyVisibleNow() stamps new Date() per call, so calling it
 * twice could straddle an article publishing between the two queries and
 * report a total that disagrees with the rows returned.
 *
 * id DESC is not cosmetic here. Offset pagination re-runs the sort on every
 * page request, and Postgres gives no stable order among rows tied on
 * publishedAt — so without a unique tie-break, articles sharing a timestamp
 * could appear on two pages or none as the reader clicks through.
 */
export async function getLatestArchive(page = 1, pageSize = 12): Promise<PaginatedArticles> {
  const where = publiclyVisibleNow();
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, page, pageSize };
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getCategoryArticles(
  slug: string,
  page = 1,
  pageSize = 12,
): Promise<PaginatedArticles & { categoryName: string | null }> {
  const category = await getCategoryBySlug(slug);
  if (!category) return { articles: [], total: 0, page, pageSize, categoryName: null };

  const where = { ...PUBLISHED, categoryId: category.id };
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, page, pageSize, categoryName: category.name };
}

export async function getCategoryTrending(
  slug: string,
  limit = 4,
): Promise<ArticleWithRelations[]> {
  const category = await getCategoryBySlug(slug);
  if (!category) return [];
  const pool = await prisma.article.findMany({
    where: { ...PUBLISHED, categoryId: category.id },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: ARTICLE_INCLUDE,
  });
  return sortTrending(pool).slice(0, limit);
}

export async function getTrendingArticles(limit = 8): Promise<ArticleWithRelations[]> {
  const pool = await prisma.article.findMany({
    where: PUBLISHED,
    orderBy: { publishedAt: "desc" },
    take: 40,
    include: ARTICLE_INCLUDE,
  });
  return sortTrending(pool).slice(0, limit);
}

export async function getPakistanTechArticles(
  page = 1,
  pageSize = 12,
): Promise<PaginatedArticles> {
  return getCategoryArticles("pakistan-tech", page, pageSize);
}

export async function getTrendingInPakistan(limit = 5): Promise<ArticleWithRelations[]> {
  const pool = await prisma.article.findMany({
    where: { ...PUBLISHED, pakistanRelevance: { gt: 0 } },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: ARTICLE_INCLUDE,
  });
  return sortPakistanTrending(pool).slice(0, limit);
}

export async function getArticleBySlug(slug: string): Promise<ArticleWithRelations | null> {
  return prisma.article.findUnique({
    where: { slug },
    include: ARTICLE_INCLUDE,
  });
}

export async function getRelatedArticles(
  article: ArticleWithRelations,
  limit = 4,
): Promise<ArticleWithRelations[]> {
  const tagIds = article.tags.map((t) => t.tagId);
  const candidates = await prisma.article.findMany({
    where: {
      ...PUBLISHED,
      id: { not: article.id },
      OR: [
        { categoryId: article.categoryId },
        ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: ARTICLE_INCLUDE,
  });

  const scored = candidates
    .map((c) => {
      const sharedTags = c.tags.filter((t) => tagIds.includes(t.tagId)).length;
      const sameCategory = c.categoryId === article.categoryId ? 3 : 0;
      return { article: c, score: sharedTags * 2 + sameCategory };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.article);
}

export async function getAdjacentArticles(article: ArticleWithRelations) {
  const [previous, next] = await Promise.all([
    prisma.article.findFirst({
      where: {
        ...PUBLISHED,
        categoryId: article.categoryId,
        publishedAt: { lt: article.publishedAt ?? new Date() },
      },
      orderBy: { publishedAt: "desc" },
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.findFirst({
      where: {
        ...PUBLISHED,
        categoryId: article.categoryId,
        publishedAt: { gt: article.publishedAt ?? new Date() },
      },
      orderBy: { publishedAt: "asc" },
      include: ARTICLE_INCLUDE,
    }),
  ]);
  return { previous, next };
}

/**
 * Increments the cheap running counter (Article.views, unchanged since
 * Phase 1) AND records a PageView event row for real time-series analytics
 * (Phase 5). PageView is a raw view-event log — not deduplicated for
 * bots/crawlers/refreshes, not a unique-visitor count. Every surface that
 * displays it must say "page views," never "readers"/"users". No IP/UA is
 * stored, by design.
 */
export async function incrementArticleViews(id: string, path: string, referrer: string | null): Promise<void> {
  await prisma.article.update({ where: { id }, data: { views: { increment: 1 } } });
  await prisma.pageView.create({ data: { articleId: id, path, referrer: referrer ?? undefined } });
}

export async function getAllAuthors() {
  return prisma.author.findMany({
    include: { _count: { select: { articles: { where: PUBLISHED } } } },
    orderBy: { name: "asc" },
  });
}

export async function getAuthorBySlug(slug: string) {
  return prisma.author.findUnique({ where: { slug } });
}

export async function getAuthorArticles(
  authorId: string,
  page = 1,
  pageSize = 12,
): Promise<PaginatedArticles> {
  const where = { ...PUBLISHED, authorId };
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, page, pageSize };
}

import "server-only";
import { prisma } from "./prisma";
import { editorialScore, sortTrending, sortPakistanTrending } from "./ranking";
import type { ArticleWithRelations } from "./types";

export const ARTICLE_INCLUDE = {
  category: true,
  author: true,
  tags: { include: { tag: true } },
  sources: { include: { source: true } },
} as const;

const PUBLISHED = { status: "PUBLISHED" as const };

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

/** Homepage "Latest" preview — recent, lightly Pakistan/importance-weighted. */
export async function getLatestPreview(limit = 8): Promise<ArticleWithRelations[]> {
  const pool = await prisma.article.findMany({
    where: PUBLISHED,
    orderBy: { publishedAt: "desc" },
    take: limit * 3,
    include: ARTICLE_INCLUDE,
  });
  return pool.sort((a, b) => editorialScore(b) - editorialScore(a)).slice(0, limit);
}

export interface PaginatedArticles {
  articles: ArticleWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

/** Strict reverse-chronological archive, for /latest. */
export async function getLatestArchive(page = 1, pageSize = 12): Promise<PaginatedArticles> {
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: PUBLISHED,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where: PUBLISHED }),
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

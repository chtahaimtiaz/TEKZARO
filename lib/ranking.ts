import type { ArticleWithRelations } from "./types";

// Editorial priority: importance x recency x Pakistan relevance x source
// reliability — never blind geography-first ranking (see Pakistan-first spec).
// Manual editorial choices (featured flag, trendingRank) always win over the
// automatic fallback.

function recencyScore(publishedAt: Date | null): number {
  if (!publishedAt) return 0;
  const hoursAgo = (Date.now() - publishedAt.getTime()) / 36e5;
  return Math.max(0, 100 - hoursAgo * 2); // decays to 0 over ~50 hours
}

export function editorialScore(article: ArticleWithRelations): number {
  const breaking = article.isBreaking ? 40 : 0;
  const pakistan = article.pakistanRelevance * 0.3;
  const global = article.globalSignificance * 0.2;
  return breaking + pakistan + global + recencyScore(article.publishedAt);
}

/** Hero: manually featured articles first (spec 6), auto-ranked fallback after. */
export function selectHero(articles: ArticleWithRelations[]): {
  main: ArticleWithRelations | null;
  secondary: ArticleWithRelations[];
} {
  const featured = articles.filter((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);
  const autoRanked = [...rest].sort((a, b) => editorialScore(b) - editorialScore(a));
  const pool = [...featured, ...autoRanked];
  return { main: pool[0] ?? null, secondary: pool.slice(1, 5) };
}

/** Trending: real views + recency + breaking, manual trendingRank overrides. */
export function sortTrending(articles: ArticleWithRelations[]): ArticleWithRelations[] {
  return [...articles].sort((a, b) => {
    if (a.trendingRank != null || b.trendingRank != null) {
      const ar = a.trendingRank ?? Number.MAX_SAFE_INTEGER;
      const br = b.trendingRank ?? Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
    }
    const scoreA = a.views * 1.5 + recencyScore(a.publishedAt) + (a.isBreaking ? 30 : 0);
    const scoreB = b.views * 1.5 + recencyScore(b.publishedAt) + (b.isBreaking ? 30 : 0);
    return scoreB - scoreA;
  });
}

export function sortPakistanTrending(
  articles: ArticleWithRelations[],
): ArticleWithRelations[] {
  return [...articles].sort((a, b) => {
    const scoreA = a.views * 1.5 + recencyScore(a.publishedAt) + a.pakistanRelevance * 1.2;
    const scoreB = b.views * 1.5 + recencyScore(b.publishedAt) + b.pakistanRelevance * 1.2;
    return scoreB - scoreA;
  });
}

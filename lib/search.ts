import { prisma } from "./prisma";
import type { ArticleWithRelations } from "./types";

const PAGE_SIZE = 10;

const ARTICLE_INCLUDE = {
  category: true,
  author: true,
  tags: { include: { tag: true } },
} as const;

export interface SearchResult {
  articles: ArticleWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Real relevance-ranked full-text search against the Postgres-generated
 * `searchVector` column (title/subheadline/excerpt weighted), unioned with
 * category/author/tag name matches so those surface even without a body hit.
 * Never returns random/unranked results.
 */
export async function searchArticles(query: string, page = 1): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { articles: [], total: 0, page, pageSize: PAGE_SIZE };

  const offset = (page - 1) * PAGE_SIZE;

  const idRows = await prisma.$queryRaw<{ id: string; rank: number }[]>`
    SELECT id, rank FROM (
      SELECT "id", ts_rank_cd("searchVector", websearch_to_tsquery('english', ${q})) AS rank
      FROM "Article"
      WHERE status = 'PUBLISHED' AND "searchVector" @@ websearch_to_tsquery('english', ${q})
      UNION
      SELECT a."id", 0.01 AS rank
      FROM "Article" a
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      LEFT JOIN "Author" au ON au.id = a."authorId"
      LEFT JOIN "ArticleTag" at ON at."articleId" = a.id
      LEFT JOIN "Tag" t ON t.id = at."tagId"
      WHERE a.status = 'PUBLISHED'
        AND (c.name ILIKE ${"%" + q + "%"} OR au.name ILIKE ${"%" + q + "%"} OR t.name ILIKE ${"%" + q + "%"})
    ) matches
    ORDER BY rank DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset};
  `;

  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT a.id) AS count
    FROM "Article" a
    LEFT JOIN "Category" c ON c.id = a."categoryId"
    LEFT JOIN "Author" au ON au.id = a."authorId"
    LEFT JOIN "ArticleTag" at ON at."articleId" = a.id
    LEFT JOIN "Tag" t ON t.id = at."tagId"
    WHERE a.status = 'PUBLISHED'
      AND (
        a."searchVector" @@ websearch_to_tsquery('english', ${q})
        OR c.name ILIKE ${"%" + q + "%"}
        OR au.name ILIKE ${"%" + q + "%"}
        OR t.name ILIKE ${"%" + q + "%"}
      );
  `;

  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) {
    return { articles: [], total: Number(countRows[0]?.count ?? 0), page, pageSize: PAGE_SIZE };
  }

  const rows = await prisma.article.findMany({
    where: { id: { in: ids } },
    include: ARTICLE_INCLUDE,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((a): a is ArticleWithRelations => Boolean(a));

  return {
    articles: ordered,
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

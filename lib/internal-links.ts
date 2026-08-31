import "server-only";
import { prisma } from "./prisma";

export interface InternalLinkSuggestion {
  id: string;
  title: string;
  slug: string;
  categoryName: string;
}

/**
 * Suggests existing PUBLISHED articles for an editor to optionally link to
 * — category and tag overlap only (no embeddings/semantic search
 * available without an AI key). Purely a suggestion list; the editor
 * decides whether to insert each one — nothing is ever inserted
 * automatically.
 */
export async function suggestInternalLinks(params: {
  excludeArticleId?: string;
  categoryId: string | null;
  tagNames: string[];
  title: string;
}): Promise<InternalLinkSuggestion[]> {
  if (!params.categoryId && params.tagNames.length === 0) return [];

  const titleWords = params.title
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 6);

  const candidates = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      ...(params.excludeArticleId ? { id: { not: params.excludeArticleId } } : {}),
      OR: [
        ...(params.categoryId ? [{ categoryId: params.categoryId }] : []),
        ...(params.tagNames.length ? [{ tags: { some: { tag: { name: { in: params.tagNames } } } } }] : []),
        ...(titleWords.length ? [{ title: { contains: titleWords[0], mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: { category: true, tags: { include: { tag: true } } },
  });

  const scored = candidates
    .map((c) => {
      let score = 0;
      if (params.categoryId && c.categoryId === params.categoryId) score += 2;
      score += c.tags.filter((t) => params.tagNames.includes(t.tag.name)).length * 2;
      const titleLower = c.title.toLowerCase();
      score += titleWords.filter((w) => titleLower.includes(w)).length;
      return { article: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 6).map((s) => ({
    id: s.article.id,
    title: s.article.title,
    slug: s.article.slug,
    categoryName: s.article.category.name,
  }));
}

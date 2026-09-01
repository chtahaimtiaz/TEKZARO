import "server-only";
import { prisma } from "./prisma";

export interface ArticleMediaOption {
  id: string;
  url: string;
  altText: string;
  reuseStatus: "UNKNOWN" | "ALLOWED" | "LICENSED" | "OWNED" | "GENERATED" | "REQUIRES_REVIEW" | "REJECTED";
  sourceDomain: string | null;
  sourceArticleUrl: string | null;
  createdAt: string;
  selectionReasons: string[] | null;
}

/** Images available for this article's own "choose from article images"
 * picker — either automatically acquired for the SourceItem this article
 * came from (lib/images/acquire.ts stores at most one Media row per
 * SourceItem, so this is usually 0 or 1 results), or manually uploaded and
 * tagged for this specific article (Media.articleId — set from
 * ArticleEditor's own upload button, or picked explicitly on the Media
 * Library page). Returns [] for an article with neither. */
export async function getArticleMediaOptions(articleId: string): Promise<ArticleMediaOption[]> {
  const sourceItem = await prisma.sourceItem.findFirst({
    where: { convertedArticleId: articleId },
    select: { id: true },
  });

  const media = await prisma.media.findMany({
    where: {
      OR: [...(sourceItem ? [{ sourceItemId: sourceItem.id }] : []), { articleId }],
    },
    orderBy: { createdAt: "desc" },
  });

  return media.map((m) => ({
    id: m.id,
    url: m.url,
    altText: m.altText,
    reuseStatus: m.reuseStatus,
    sourceDomain: m.sourceDomain,
    sourceArticleUrl: m.sourceArticleUrl,
    createdAt: m.createdAt.toISOString(),
    selectionReasons: (m.selectionReasons as string[] | null) ?? null,
  }));
}

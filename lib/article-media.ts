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

/** Images already acquired for the SourceItem this article came from (if
 * any) — lets an editor pick from what the discovery pipeline actually
 * found for THIS story, in context, rather than only the plain
 * upload/hand-typed-URL flow. lib/images/acquire.ts stores at most one
 * Media row per SourceItem today (it stops at the first valid candidate),
 * so this is usually 0 or 1 results — still worth surfacing, since it's a
 * dedicated in-context review point for an unreviewed auto-acquired image,
 * not just a hypothetical multi-choice gallery. Returns [] for an article
 * with no linked SourceItem (created from scratch, not from discovery). */
export async function getArticleSourceItemMedia(articleId: string): Promise<ArticleMediaOption[]> {
  const sourceItem = await prisma.sourceItem.findFirst({
    where: { convertedArticleId: articleId },
    select: { id: true },
  });
  if (!sourceItem) return [];

  const media = await prisma.media.findMany({
    where: { sourceItemId: sourceItem.id },
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

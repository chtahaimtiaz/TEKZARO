import { prisma } from "./prisma";
import type { ContentBlock } from "./content-blocks";
import type { Prisma } from "@prisma/client";

// Deliberately NOT a "use server" file — every export from one must be an
// async function, and buildSnapshotFromArticleRow is a plain sync helper.
// Shared by lib/article-actions.ts (human-driven transitions) and
// app/api/cron/publish-scheduled/route.ts (the automated publish path), so
// both produce identical ArticleVersion snapshots.

/** Snapshot straight from a DB row (used by workflow transitions, which
 * change status/publishedAt but not the editable content itself). */
export function buildSnapshotFromArticleRow(
  article: Prisma.ArticleGetPayload<{ include: { tags: { include: { tag: true } } } }>,
): Prisma.InputJsonValue {
  return {
    title: article.title,
    subheadline: article.subheadline,
    excerpt: article.excerpt,
    blocks: (article.content as unknown as { blocks?: ContentBlock[] }).blocks ?? [],
    categoryId: article.categoryId,
    authorId: article.authorId,
    tagNames: article.tags.map((t) => t.tag.name),
    locationName: article.locationName,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    featuredImageCaption: article.featuredImageCaption,
    featuredImageCredit: article.featuredImageCredit,
    seoTitle: article.seoTitle,
    metaDescription: article.metaDescription,
    canonicalUrl: article.canonicalUrl,
    ogImage: article.ogImage,
  } as unknown as Prisma.InputJsonValue;
}

async function nextVersionNumber(articleId: string): Promise<number> {
  const last = await prisma.articleVersion.findFirst({
    where: { articleId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

export async function snapshotVersion(params: {
  articleId: string;
  editorId: string;
  status: Prisma.ArticleGetPayload<object>["status"];
  title: string;
  snapshot: Prisma.InputJsonValue;
  changeSummary?: string;
}): Promise<void> {
  const versionNumber = await nextVersionNumber(params.articleId);
  await prisma.articleVersion.create({
    data: {
      articleId: params.articleId,
      editorId: params.editorId,
      versionNumber,
      status: params.status,
      title: params.title,
      snapshot: params.snapshot,
      changeSummary: params.changeSummary,
    },
  });
}

import "server-only";
import { prisma } from "./prisma";
import { asArticleContent } from "./content-blocks";
import type { ContentBlock } from "./content-blocks";

export interface UrduTranslationView {
  status: string;
  title: string | null;
  slug: string | null;
  dek: string | null;
  content: ContentBlock[];
  seoTitle: string | null;
  metaDescription: string | null;
  socialTitle: string | null;
  socialDescription: string | null;
  generatedAt: Date | null;
  publishedAt: Date | null;
  manuallyEdited: boolean;
  lastEditedAt: Date | null;
  failureReason: string | null;
  /** True when the English article has been edited more recently than this
   * translation was last generated/edited — surfaced to the editor as "may
   * be outdated," not auto-corrected, since only a human (or an explicit
   * regenerate) should decide whether the drift actually matters. */
  outdated: boolean;
}

export async function getUrduTranslation(articleId: string): Promise<UrduTranslationView | null> {
  const [translation, article] = await Promise.all([
    prisma.articleTranslation.findUnique({ where: { articleId } }),
    prisma.article.findUnique({ where: { id: articleId }, select: { updatedAt: true } }),
  ]);
  if (!translation) return null;

  const lastTouched = translation.lastEditedAt ?? translation.generatedAt ?? translation.createdAt;
  const outdated = translation.status !== "NOT_REQUESTED" && Boolean(article) && article!.updatedAt > lastTouched;

  return {
    status: translation.status,
    title: translation.title,
    slug: translation.slug,
    dek: translation.dek,
    content: asArticleContent(translation.content).blocks,
    seoTitle: translation.seoTitle,
    metaDescription: translation.metaDescription,
    socialTitle: translation.socialTitle,
    socialDescription: translation.socialDescription,
    generatedAt: translation.generatedAt,
    publishedAt: translation.publishedAt,
    manuallyEdited: translation.manuallyEdited,
    lastEditedAt: translation.lastEditedAt,
    failureReason: translation.failureReason,
    outdated,
  };
}

/** Reads one PUBLISHED Urdu translation for the public /ur/[slug] route —
 * separate from getUrduTranslation (which is admin-facing and doesn't
 * filter by status), since the public route must never expose an
 * unpublished translation regardless of what state it's in. */
export async function getPublishedUrduTranslationBySlug(slug: string) {
  return prisma.articleTranslation.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      article: {
        include: { category: true, author: true, tags: { include: { tag: true } }, sources: { include: { source: true } } },
      },
    },
  });
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canEditArticle } from "@/lib/permissions";
import { legalTransitionsFor } from "@/lib/workflow";
import { asArticleContent } from "@/lib/content-blocks";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { isMediaUploadAvailable } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [article, categories, authors] = await Promise.all([
    prisma.article.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        featuredMedia: {
          select: { id: true, reuseStatus: true, sourceDomain: true, sourceArticleUrl: true, createdAt: true, selectionReasons: true },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.author.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!article) notFound();

  const canEdit = canEditArticle(user.role, article, user.id);
  const content = asArticleContent(article.content);
  const legalTransitions = legalTransitionsFor(article.status, user.role, article.createdById === user.id);

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-border bg-paper-raised p-6">
        <p className="font-bold">You don&apos;t have permission to edit this article.</p>
        <p className="mt-1 text-sm text-ink-muted">
          {user.role === "REPORTER"
            ? "Reporters can only edit their own drafts."
            : "Contact an editor or admin."}
        </p>
      </div>
    );
  }

  return (
    <ArticleEditor
      mode="edit"
      articleId={article.id}
      status={article.status}
      initialBlocks={content.blocks}
      initialFeaturedMedia={
        article.featuredMedia
          ? {
              id: article.featuredMedia.id,
              reuseStatus: article.featuredMedia.reuseStatus,
              sourceDomain: article.featuredMedia.sourceDomain,
              sourceArticleUrl: article.featuredMedia.sourceArticleUrl,
              createdAt: article.featuredMedia.createdAt.toISOString(),
              selectionReasons: (article.featuredMedia.selectionReasons as string[] | null) ?? null,
            }
          : null
      }
      verification={{
        status: article.verificationStatus,
        primarySourceUrl: article.primarySourceUrl,
        notes: article.verificationNotes,
        autoPublished: article.autoPublished,
      }}
      initial={{
        title: article.title,
        slug: article.slug,
        subheadline: article.subheadline ?? "",
        excerpt: article.excerpt ?? "",
        categoryId: article.categoryId,
        authorId: article.authorId,
        tagNames: article.tags.map((t) => t.tag.name),
        locationName: article.locationName ?? "",
        featuredImageUrl: article.featuredImageUrl ?? "",
        featuredImageAlt: article.featuredImageAlt ?? "",
        featuredImageCaption: article.featuredImageCaption ?? "",
        featuredImageCredit: article.featuredImageCredit ?? "",
        featuredMediaId: article.featuredMediaId ?? "",
        seoTitle: article.seoTitle ?? "",
        metaDescription: article.metaDescription ?? "",
        canonicalUrl: article.canonicalUrl ?? "",
        ogImage: article.ogImage ?? "",
        isBreaking: article.isBreaking,
        featured: article.featured,
        pakistanRelevance: article.pakistanRelevance,
        regionalRelevance: article.regionalRelevance,
        globalSignificance: article.globalSignificance,
        scheduledAt: article.scheduledAt ? article.scheduledAt.toISOString().slice(0, 16) : "",
      }}
      categories={categories}
      authors={authors}
      legalTransitions={legalTransitions}
      mediaUploadAvailable={isMediaUploadAvailable()}
    />
  );
}

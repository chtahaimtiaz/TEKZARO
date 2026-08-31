import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canViewArticle } from "@/lib/permissions";
import { asArticleContent } from "@/lib/content-blocks";
import { PlaceholderArt } from "@/components/ui/PlaceholderArt";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { AuthorByline } from "@/components/content/AuthorByline";
import { isOptimizableImageSrc } from "@/lib/image-src";
import { PublishedUpdatedMeta } from "@/components/article/PublishedUpdatedMeta";
import { ArticleBody } from "@/components/article/ArticleBody";
import { TagList } from "@/components/content/TagList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const article = await prisma.article.findUnique({
    where: { id },
    include: { category: true, author: true, tags: { include: { tag: true } } },
  });
  if (!article) notFound();
  if (!canViewArticle(user.role, article, user.id)) {
    return <p className="text-sm text-ink-muted">You don&apos;t have permission to preview this article.</p>;
  }

  const content = asArticleContent(article.content);
  const isPakistan = article.category.slug === "pakistan-tech" || article.pakistanRelevance >= 70;

  return (
    <div className="mx-auto max-w-3xl bg-paper px-4 py-10">
      <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
        <strong>Preview</strong> — status: {article.status.replace(/_/g, " ")}. Not publicly accessible.
      </div>

      <div className="flex items-center gap-2">
        <p className={`eyebrow ${isPakistan ? "eyebrow-pakistan" : ""}`}>{article.category.name}</p>
        {article.isDemo && <DemoBadge />}
      </div>
      <h1 className="mt-2 text-balance font-serif text-4xl font-bold leading-tight sm:text-5xl">{article.title}</h1>
      {article.subheadline && <p className="mt-3 text-lg text-ink-soft">{article.subheadline}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
        <AuthorByline author={article.author} publishedAt={article.publishedAt} readingTime={article.readingTime} size="md" />
        <PublishedUpdatedMeta publishedAt={article.publishedAt} updatedAt={article.updatedAt} />
      </div>

      <figure className="mt-6 overflow-hidden rounded-xl">
        {article.featuredImageUrl ? (
          <Image src={article.featuredImageUrl} alt={article.featuredImageAlt ?? article.title} width={1400} height={875} unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)} className="w-full object-cover" />
        ) : (
          <PlaceholderArt seed={article.slug || article.id} label={article.category.name} className="aspect-[16/10] w-full" />
        )}
      </figure>

      <div className="mt-8">
        <ArticleBody blocks={content.blocks} />
      </div>

      <div className="mt-8">
        <TagList tags={article.tags.map((t) => t.tag)} />
      </div>
    </div>
  );
}

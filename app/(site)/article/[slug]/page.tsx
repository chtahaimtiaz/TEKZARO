import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { PlaceholderArt } from "@/components/ui/PlaceholderArt";
import { AuthorByline } from "@/components/content/AuthorByline";
import { PublishedUpdatedMeta } from "@/components/article/PublishedUpdatedMeta";
import { ArticleBody } from "@/components/article/ArticleBody";
import { TagList } from "@/components/content/TagList";
import { ShareButtons } from "@/components/content/ShareButtons";
import { RelatedArticles } from "@/components/content/RelatedArticles";
import { PrevNextArticle } from "@/components/content/PrevNextArticle";
import { ArticleJsonLd } from "@/components/article/ArticleJsonLd";
import { getArticleBySlug, getRelatedArticles, getAdjacentArticles, incrementArticleViews } from "@/lib/articles";
import { asArticleContent } from "@/lib/content-blocks";
import { buildArticleMetadata, absoluteUrl } from "@/lib/seo";
import { categoryHref } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || article.status !== "PUBLISHED" || article.isDemo) return {};
  return buildArticleMetadata(article);
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article || article.status !== "PUBLISHED" || article.isDemo) notFound();

  const referrer = (await headers()).get("referer");
  after(() => incrementArticleViews(article.id, `/article/${slug}`, referrer));

  const [related, { previous, next }] = await Promise.all([
    getRelatedArticles(article),
    getAdjacentArticles(article),
  ]);

  const content = asArticleContent(article.content);
  const isPakistan = article.category.slug === "pakistan-tech" || article.pakistanRelevance >= 70;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <ArticleJsonLd article={article} />

      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-ink-muted">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <span aria-hidden> / </span>
        <Link href={categoryHref(article.category.slug)} className="hover:text-accent">
          {article.category.name}
        </Link>
      </nav>

      <div className="flex items-center gap-2">
        <p className={`eyebrow ${isPakistan ? "eyebrow-pakistan" : ""}`}>{article.category.name}</p>
      </div>
      <h1 className="mt-2 text-balance font-serif text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{article.title}</h1>
      {article.subheadline && <p className="mt-3 text-base text-ink-soft sm:text-lg">{article.subheadline}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
        <AuthorByline author={article.author} publishedAt={article.publishedAt} readingTime={article.readingTime} size="md" />
        <PublishedUpdatedMeta publishedAt={article.publishedAt} updatedAt={article.updatedAt} />
      </div>

      <figure className="mt-6 overflow-hidden rounded-xl">
        {article.featuredImageUrl ? (
          <Image
            src={article.featuredImageUrl}
            alt={article.featuredImageAlt ?? article.title}
            width={1400}
            height={875}
            priority
            unoptimized={!isOptimizableImageSrc(article.featuredImageUrl)}
            className="w-full object-cover"
          />
        ) : (
          <PlaceholderArt seed={article.slug} label={article.category.name} className="aspect-[16/10] w-full" />
        )}
        {(article.featuredImageCaption || article.featuredImageCredit) && (
          <figcaption className="mt-2 text-sm text-ink-muted">
            {article.featuredImageCaption}
            {article.featuredImageCredit && <span className="italic"> ({article.featuredImageCredit})</span>}
          </figcaption>
        )}
      </figure>

      <div className="mt-8">
        <ArticleBody blocks={content.blocks} />
      </div>

      {article.sources.length > 0 && (
        <section className="mt-8 rounded-lg border border-border bg-paper-raised p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Sources</p>
          <ul className="mt-2 space-y-1 text-sm">
            {article.sources.map((s) => (
              <li key={s.sourceId}>
                <a href={s.source.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {s.source.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <TagList tags={article.tags.map((t) => t.tag)} />
        <ShareButtons url={absoluteUrl(`/article/${article.slug}`)} title={article.title} />
      </div>

      <PrevNextArticle previous={previous} next={next} />
      <RelatedArticles articles={related} />
    </article>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceholderArt } from "@/components/ui/PlaceholderArt";
import { AuthorByline } from "@/components/content/AuthorByline";
import { PublishedUpdatedMeta } from "@/components/article/PublishedUpdatedMeta";
import { ArticleBody } from "@/components/article/ArticleBody";
import { TagList } from "@/components/content/TagList";
import { ShareButtons } from "@/components/content/ShareButtons";
import { LanguageSwitcher } from "@/components/article/LanguageSwitcher";
import { getPublishedUrduTranslationBySlug } from "@/lib/urdu-translation";
import { asArticleContent } from "@/lib/content-blocks";
import { buildUrduArticleMetadata, buildUrduArticleJsonLd, absoluteUrl } from "@/lib/seo";
import { breadcrumbJsonLd } from "@/lib/seo";
import { categoryHref } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const translation = await getPublishedUrduTranslationBySlug(slug);
  if (!translation || !translation.title) return {};
  const { article } = translation;
  return buildUrduArticleMetadata({
    slug: article.slug,
    title: translation.title,
    seoTitle: translation.seoTitle,
    metaDescription: translation.metaDescription,
    dek: translation.dek,
    articleExcerpt: article.excerpt,
    ogImage: article.ogImage,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    publishedAt: translation.publishedAt,
    updatedAt: translation.updatedAt,
    authorName: article.author.name,
    authorSlug: article.author.slug,
    categoryName: article.category.name,
  });
}

// Not RTL-scoped globally (app/layout.tsx keeps <html lang="en">, matching
// every other page on the site) — only this route's own content wrapper
// carries lang="ur" dir="rtl", per Stage 7's "only Urdu pages/components
// use RTL behavior" requirement.
export default async function UrduArticlePage({ params }: Props) {
  const { slug } = await params;
  const translation = await getPublishedUrduTranslationBySlug(slug);

  if (!translation || !translation.title) notFound();
  const { article } = translation;
  if (article.status !== "PUBLISHED" || article.isDemo) notFound();

  const content = asArticleContent(translation.content);
  const seoInput = {
    slug: article.slug,
    title: translation.title,
    seoTitle: translation.seoTitle,
    metaDescription: translation.metaDescription,
    dek: translation.dek,
    articleExcerpt: article.excerpt,
    ogImage: article.ogImage,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    publishedAt: translation.publishedAt,
    updatedAt: translation.updatedAt,
    authorName: article.author.name,
    authorSlug: article.author.slug,
    categoryName: article.category.name,
  };
  const jsonLd = [
    buildUrduArticleJsonLd(seoInput),
    breadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: article.category.name, url: categoryHref(article.category.slug) },
      { name: translation.title, url: `/ur/${article.slug}` },
    ]),
  ];

  return (
    <article lang="ur" dir="rtl" className="mx-auto max-w-3xl px-4 py-10 text-right">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2" dir="ltr">
        <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span aria-hidden> / </span>
          <Link href={categoryHref(article.category.slug)} className="hover:text-accent">
            {article.category.name}
          </Link>
        </nav>
        <LanguageSwitcher slug={article.slug} current="ur" urduAvailable />
      </div>

      <div className="mt-3">
        <p className="eyebrow">{article.category.name}</p>
      </div>
      <h1 className="mt-2 text-balance font-serif text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{translation.title}</h1>
      {translation.dek && <p className="mt-3 text-base text-ink-soft sm:text-lg">{translation.dek}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4" dir="ltr">
        <AuthorByline author={article.author} publishedAt={translation.publishedAt} readingTime={article.readingTime} size="md" />
        <PublishedUpdatedMeta publishedAt={translation.publishedAt} updatedAt={translation.updatedAt} />
      </div>

      <figure className="mt-6 overflow-hidden rounded-xl">
        {article.featuredImageUrl ? (
          <Image
            src={article.featuredImageUrl}
            alt={article.featuredImageAlt ?? translation.title}
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
          <figcaption className="mt-2 text-sm text-ink-muted" dir="ltr">
            {article.featuredImageCaption}
            {article.featuredImageCredit && <span className="italic"> ({article.featuredImageCredit})</span>}
          </figcaption>
        )}
      </figure>

      <div className="mt-8">
        <ArticleBody blocks={content.blocks} />
      </div>

      {article.sources.length > 0 && (
        <section className="mt-8 rounded-lg border border-border bg-paper-raised p-4" dir="ltr">
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4" dir="ltr">
        <TagList tags={article.tags.map((t) => t.tag)} />
        <ShareButtons url={absoluteUrl(`/ur/${article.slug}`)} title={translation.title} />
      </div>
    </article>
  );
}

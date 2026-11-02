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
import { ReadingProgressBar } from "@/components/article/ReadingProgressBar";
import { AdSlot } from "@/components/ads/AdSlot";
import { AuthorBioCard } from "@/components/article/AuthorBioCard";
import { EditorialStandardsCallout } from "@/components/article/EditorialStandardsCallout";
import { NewsletterForm } from "@/components/ui/NewsletterForm";
import { getArticleBySlug, getRelatedArticles, getAdjacentArticles, incrementArticleViews } from "@/lib/articles";
import { asArticleContent } from "@/lib/content-blocks";
import { buildArticleMetadata, absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";
import { categoryHref } from "@/lib/constants";
import { isOptimizableImageSrc } from "@/lib/image-src";

export const revalidate = 3600; // Revalidate article pages every hour

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

  const breadcrumbJsonLdData = breadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: article.category.name, url: categoryHref(article.category.slug) },
    { name: article.title, url: `/article/${article.slug}` },
  ]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <ReadingProgressBar />
      <ArticleJsonLd article={article} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLdData) }}
      />

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
        <ArticleBody blocks={content.blocks} articleTitle={article.title} />
      </div>

      <EditorialStandardsCallout />

      <AdSlot placement="ARTICLE_END" categoryId={article.category.id} path={`/article/${slug}`} className="mt-8" />

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

      <AuthorBioCard author={article.author} />

      <PrevNextArticle previous={previous} next={next} />
      <RelatedArticles articles={related} />

      <section className="mt-12 rounded-xl bg-ink px-6 py-8 text-center text-white dark:text-paper">
        <p className="eyebrow">Stay Informed</p>
        <h2 className="mt-1 font-serif text-2xl font-bold">Get TEKZARO in your inbox</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/70 dark:text-paper/70">
          Pakistan technology news first, global technology in context.
        </p>
        <div className="mt-5 flex justify-center">
          <NewsletterForm redirectTo={`/article/${article.slug}`} />
        </div>
      </section>
    </article>
  );
}

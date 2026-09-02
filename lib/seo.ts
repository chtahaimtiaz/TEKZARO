import type { Metadata } from "next";
import type { ArticleWithRelations } from "./types";
import { siteUrl, SITE_NAME, SITE_DESCRIPTION } from "./constants";

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * hasUrduTranslation: pass true when a PUBLISHED ArticleTranslation exists
 * for this article — adds the reciprocal hreflang alternate so search
 * engines see the two language versions as translations of each other,
 * not duplicate content. Omit/false when there's no Urdu version (or it
 * isn't published yet) so no broken alternate is ever advertised.
 */
export function buildArticleMetadata(article: ArticleWithRelations, opts?: { hasUrduTranslation?: boolean }): Metadata {
  const title = article.seoTitle || article.title;
  const description = article.metaDescription || article.excerpt || SITE_DESCRIPTION;
  const url = absoluteUrl(`/article/${article.slug}`);
  // Falls back to the logo (rather than no image at all) for the rare
  // article with neither an explicit ogImage nor a featured image — a
  // branded card beats a blank one on social platforms.
  const image = article.ogImage || article.featuredImageUrl || absoluteUrl("/logo.png");

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: {
      canonical: article.canonicalUrl || url,
      languages: opts?.hasUrduTranslation
        ? { en: url, ur: absoluteUrl(`/ur/${article.slug}`), "x-default": url }
        : undefined,
    },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: image ? [{ url: image, width: 1200, height: 630, alt: article.featuredImageAlt || title }] : undefined,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      authors: [article.author.name],
      section: article.category.name,
      tags: article.tags.map((t) => t.tag.name),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function buildArticleJsonLd(article: ArticleWithRelations) {
  const url = absoluteUrl(`/article/${article.slug}`);
  const image = article.ogImage || article.featuredImageUrl;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt || article.metaDescription || undefined,
    image: image ? [image] : undefined,
    inLanguage: "en",
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: article.author.name,
      url: absoluteUrl(`/author/${article.author.slug}`),
    },
    publisher: organizationJsonLd(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: article.category.name,
    keywords: article.tags.map((t) => t.tag.name).join(", ") || undefined,
  };
}

export interface UrduArticleSeoInput {
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  dek: string | null;
  articleExcerpt: string | null;
  ogImage: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  authorName: string;
  authorSlug: string;
  categoryName: string;
}

/** Urdu sibling of buildArticleMetadata — canonical points at /ur/<slug>,
 * with the reciprocal hreflang back to the English original (always
 * present: a published Urdu translation only ever exists because its
 * English article was already published — see
 * lib/urdu-translation-actions.ts's publishUrduTranslationAction). */
export function buildUrduArticleMetadata(a: UrduArticleSeoInput): Metadata {
  const title = a.seoTitle || a.title;
  const description = a.metaDescription || a.dek || a.articleExcerpt || SITE_DESCRIPTION;
  const url = absoluteUrl(`/ur/${a.slug}`);
  const enUrl = absoluteUrl(`/article/${a.slug}`);
  const image = a.ogImage || a.featuredImageUrl || absoluteUrl("/logo.png");

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: {
      canonical: url,
      languages: { en: enUrl, ur: url, "x-default": enUrl },
    },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "ur_PK",
      images: image ? [{ url: image, width: 1200, height: 630, alt: a.featuredImageAlt || title }] : undefined,
      publishedTime: a.publishedAt?.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      authors: [a.authorName],
      section: a.categoryName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function buildUrduArticleJsonLd(a: UrduArticleSeoInput) {
  const url = absoluteUrl(`/ur/${a.slug}`);
  const image = a.ogImage || a.featuredImageUrl;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description: a.dek || a.articleExcerpt || a.metaDescription || undefined,
    image: image ? [image] : undefined,
    inLanguage: "ur",
    datePublished: a.publishedAt?.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: a.authorName,
      url: absoluteUrl(`/author/${a.authorSlug}`),
    },
    publisher: organizationJsonLd(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: a.categoryName,
  };
}

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon.svg"),
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl()}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

import type { Metadata } from "next";
import type { ArticleWithRelations } from "./types";
import { siteUrl, SITE_NAME, SITE_DESCRIPTION } from "./constants";

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildArticleMetadata(article: ArticleWithRelations): Metadata {
  const title = article.seoTitle || article.title;
  const description = article.metaDescription || article.excerpt || SITE_DESCRIPTION;
  const url = absoluteUrl(`/article/${article.slug}`);
  // Falls back to the logo (rather than no image at all) for the rare
  // article with neither an explicit ogImage nor a featured image — a
  // branded card beats a blank one on social platforms.
  const image = article.ogImage || article.featuredImageUrl || absoluteUrl("/logo.png");

  return {
    // Just the headline — the root layout's title.template ("%s | TEKZARO",
    // app/layout.tsx) appends the brand. Appending it here too produced
    // "Headline | TEKZARO | TEKZARO" on every article, which is what search
    // results and browser tabs actually showed.
    title,
    description,
    alternates: { canonical: article.canonicalUrl || url },
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

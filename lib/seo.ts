import type { Metadata } from "next";
import type { ArticleWithRelations } from "./types";
import { siteUrl, SITE_NAME, SITE_DESCRIPTION } from "./constants";
import { socialProfileUrls } from "./social-links";

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

/**
 * Stable identifier for the TEKZARO organization entity. Every node that
 * describes the publisher carries this same @id, which is what tells a
 * consumer that the sitewide organization and an article's publisher are
 * one entity rather than two that happen to share a name.
 *
 * Derived from siteUrl() rather than hardcoded so it cannot drift from the
 * canonical host the rest of the metadata uses.
 */
export function organizationId(): string {
  return `${siteUrl()}/#organization`;
}

/**
 * The single authoritative publisher node. Emitted sitewide from
 * app/layout.tsx and reused as the `publisher` of every NewsArticle, so the
 * entity is described once and cannot diverge between the two.
 *
 * NewsMediaOrganization rather than plain Organization: it is a schema.org
 * subtype of Organization, so nothing that consumed the old markup breaks,
 * and it states what this publisher actually is instead of leaving it to be
 * inferred.
 *
 * Deliberately kept as a full node in both places rather than reducing the
 * article's publisher to a bare {"@id": ...} reference. The shared @id
 * already does the deduplication work, while Google's Article guidance
 * expects publisher.name and publisher.logo to be present — a bare
 * reference relies on the consumer resolving an @id across two separate
 * script blocks, which is a needless bet when the node costs a few bytes.
 *
 * `sameAs` reads the same lib/social-links.ts list the footer renders, so a
 * profile can never be asserted here while absent from the site. It is the
 * standard association signal, not a guarantee any search engine surfaces
 * the accounts.
 *
 * No alternateName, address, telephone, registration number or membership
 * is claimed: none is genuinely established, and inventing entity
 * identifiers is worse than omitting them.
 */
export function organizationJsonLd() {
  return {
    "@type": "NewsMediaOrganization",
    "@id": organizationId(),
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/logo.png"),
    },
    sameAs: socialProfileUrls(),
  };
}

/** Ties the site to the organization that publishes it by @id, rather than
 *  leaving two unconnected top-level entities on the page. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    publisher: { "@id": organizationId() },
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl()}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Author pages describe a real person on staff, so they get a Person node
 * tied to the publisher. Only fields the system actually holds are emitted
 * — no invented biography, employment history, qualification or credential.
 * `description` is the author's own stored bio when there is one, and is
 * omitted rather than filled with generated filler when there isn't.
 */
export function authorJsonLd(author: {
  name: string;
  slug: string;
  bio?: string | null;
  photoUrl?: string | null;
  position?: string | null;
}) {
  const url = absoluteUrl(`/author/${author.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name: author.name,
      url,
      description: author.bio || undefined,
      jobTitle: author.position || undefined,
      image: author.photoUrl || undefined,
      worksFor: { "@id": organizationId() },
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

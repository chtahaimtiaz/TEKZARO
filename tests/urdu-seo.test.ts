import { describe, it, expect } from "vitest";
import { buildArticleMetadata, buildArticleJsonLd, buildUrduArticleMetadata, buildUrduArticleJsonLd, absoluteUrl } from "../lib/seo";
import type { ArticleWithRelations } from "../lib/types";

const baseArticle = {
  id: "article-1",
  slug: "test-article",
  title: "Test Article Headline",
  subheadline: null,
  excerpt: "A short excerpt.",
  content: { blocks: [] },
  seoTitle: null,
  metaDescription: null,
  canonicalUrl: null,
  ogImage: null,
  featuredImageUrl: null,
  featuredImageAlt: null,
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  category: { id: "cat-1", name: "AI", slug: "ai" },
  author: { id: "author-1", name: "Test Author", slug: "test-author" },
  tags: [],
} as unknown as ArticleWithRelations;

describe("buildArticleMetadata — hreflang", () => {
  it("omits the languages/hreflang block when no Urdu translation exists", () => {
    const metadata = buildArticleMetadata(baseArticle);
    expect(metadata.alternates?.languages).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(absoluteUrl("/article/test-article"));
  });

  it("adds reciprocal en/ur/x-default hreflang alternates when a published Urdu translation exists", () => {
    const metadata = buildArticleMetadata(baseArticle, { hasUrduTranslation: true });
    const languages = metadata.alternates?.languages as Record<string, string>;
    expect(languages.en).toBe(absoluteUrl("/article/test-article"));
    expect(languages.ur).toBe(absoluteUrl("/ur/test-article"));
    expect(languages["x-default"]).toBe(absoluteUrl("/article/test-article"));
  });
});

describe("buildArticleJsonLd — inLanguage", () => {
  it("sets inLanguage to en for the English article", () => {
    const jsonLd = buildArticleJsonLd(baseArticle);
    expect(jsonLd.inLanguage).toBe("en");
  });
});

const urduSeoInput = {
  slug: "test-article",
  title: "ٹیسٹ آرٹیکل کا عنوان",
  seoTitle: null,
  metaDescription: null,
  dek: "ایک مختصر ذیلی عنوان",
  articleExcerpt: "A short excerpt.",
  ogImage: null,
  featuredImageUrl: null,
  featuredImageAlt: null,
  publishedAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  authorName: "Test Author",
  authorSlug: "test-author",
  categoryName: "AI",
};

describe("buildUrduArticleMetadata", () => {
  it("canonicalizes to /ur/<slug> with the reciprocal English hreflang", () => {
    const metadata = buildUrduArticleMetadata(urduSeoInput);
    expect(metadata.alternates?.canonical).toBe(absoluteUrl("/ur/test-article"));
    const languages = metadata.alternates?.languages as Record<string, string>;
    expect(languages.en).toBe(absoluteUrl("/article/test-article"));
    expect(languages.ur).toBe(absoluteUrl("/ur/test-article"));
    expect(languages["x-default"]).toBe(absoluteUrl("/article/test-article"));
  });

  it("uses the Urdu title in the page title and description", () => {
    const metadata = buildUrduArticleMetadata(urduSeoInput);
    expect(metadata.title).toContain("ٹیسٹ آرٹیکل کا عنوان");
    expect(metadata.description).toBe("ایک مختصر ذیلی عنوان");
  });
});

describe("buildUrduArticleJsonLd", () => {
  it("sets inLanguage to ur and points mainEntityOfPage at the /ur/ URL", () => {
    const jsonLd = buildUrduArticleJsonLd(urduSeoInput);
    expect(jsonLd.inLanguage).toBe("ur");
    expect(jsonLd.headline).toBe("ٹیسٹ آرٹیکل کا عنوان");
    expect((jsonLd.mainEntityOfPage as { "@id": string })["@id"]).toBe(absoluteUrl("/ur/test-article"));
  });
});

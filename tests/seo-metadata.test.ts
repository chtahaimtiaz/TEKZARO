import { describe, it, expect } from "vitest";
import { buildArticleMetadata, buildArticleJsonLd } from "../lib/seo";
import { SITE_NAME } from "../lib/constants";
import type { ArticleWithRelations } from "../lib/types";

function article(overrides: Partial<ArticleWithRelations> = {}): ArticleWithRelations {
  return {
    slug: "a-real-headline",
    title: "A real headline",
    seoTitle: null,
    metaDescription: null,
    excerpt: "An excerpt.",
    canonicalUrl: null,
    ogImage: null,
    featuredImageUrl: null,
    featuredImageAlt: null,
    publishedAt: new Date("2026-09-03T08:00:00.000Z"),
    updatedAt: new Date("2026-09-03T09:00:00.000Z"),
    author: { name: "TEKZARO Editorial", slug: "tekzaro-editorial" },
    category: { name: "Computing", slug: "computing" },
    tags: [],
    ...overrides,
  } as unknown as ArticleWithRelations;
}

describe("article metadata", () => {
  // The root layout sets title.template = "%s | TEKZARO", which Next applies
  // to whatever string a page returns. buildArticleMetadata also appended
  // the brand itself, so live article pages rendered
  // "Headline | TEKZARO | TEKZARO" in the tab and in search results.
  it("returns the bare headline so the layout template appends the brand exactly once", () => {
    const meta = buildArticleMetadata(article());
    expect(meta.title).toBe("A real headline");
    expect(String(meta.title)).not.toContain(SITE_NAME);
  });

  it("prefers seoTitle over the headline, still without the brand", () => {
    const meta = buildArticleMetadata(article({ seoTitle: "A tuned SEO headline" }));
    expect(meta.title).toBe("A tuned SEO headline");
    expect(String(meta.title)).not.toContain(SITE_NAME);
  });

  it("does not double the brand once the layout template is applied", () => {
    const rendered = `${buildArticleMetadata(article()).title} | ${SITE_NAME}`;
    expect(rendered).toBe(`A real headline | ${SITE_NAME}`);
    expect(rendered.match(new RegExp(SITE_NAME, "g"))).toHaveLength(1);
  });

  it("still carries a canonical, description and social titles", () => {
    const meta = buildArticleMetadata(article());
    expect(meta.alternates?.canonical).toContain("/article/a-real-headline");
    expect(meta.description).toBe("An excerpt.");
    expect(meta.openGraph?.title).toBe("A real headline");
    expect(meta.twitter?.title).toBe("A real headline");
  });

  it("emits NewsArticle structured data with the headline and canonical url", () => {
    const ld = buildArticleJsonLd(article()) as Record<string, unknown>;
    expect(ld["@type"]).toBe("NewsArticle");
    expect(ld.headline).toBe("A real headline");
  });
});

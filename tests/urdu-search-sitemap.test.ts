import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { searchArticles } from "../lib/search";
import sitemap from "../app/sitemap";
import { trackArticle, cleanupTestData } from "./helpers";
import { siteUrl } from "../lib/constants";

let categoryId: string;
let authorId: string;
const distinctiveUrduWord = `اردوٹیسٹلفظ${Date.now()}`;

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Urdu Search Test Category ${Date.now()}`, slug: `urdu-search-test-category-${Date.now()}` },
  });
  categoryId = category.id;
  const author = await prisma.author.create({
    data: { name: `Urdu Search Test Author ${Date.now()}`, slug: `urdu-search-test-author-${Date.now()}` },
  });
  authorId = author.id;
});

afterAll(async () => {
  await cleanupTestData();
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
});

describe("searchArticles — Urdu content", () => {
  it("finds the underlying English article via a published Urdu translation's title, without a separate Article record", async () => {
    const article = await prisma.article.create({
      data: {
        slug: `urdu-search-test-article-${Date.now()}`,
        title: "English-only title unrelated to the search term",
        content: { blocks: [{ type: "paragraph", text: "English body." }] },
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        authorId,
      },
    });
    trackArticle(article.id);

    await prisma.articleTranslation.create({
      data: {
        articleId: article.id,
        status: "PUBLISHED",
        title: `${distinctiveUrduWord} کے بارے میں خبر`,
        slug: article.slug,
        content: { blocks: [{ type: "paragraph", text: "اردو باڈی متن۔" }] },
        publishedAt: new Date(),
      },
    });

    const result = await searchArticles(distinctiveUrduWord);
    expect(result.articles.some((a) => a.id === article.id)).toBe(true);
  });

  it("does not match an UNPUBLISHED Urdu translation", async () => {
    const article = await prisma.article.create({
      data: {
        slug: `urdu-search-unpub-test-${Date.now()}`,
        title: "Another unrelated English title",
        content: { blocks: [{ type: "paragraph", text: "English body." }] },
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        authorId,
      },
    });
    trackArticle(article.id);
    const term = `غیرشائع${Date.now()}`;

    await prisma.articleTranslation.create({
      data: {
        articleId: article.id,
        status: "READY", // not published
        title: `${term} کے بارے میں خبر`,
        slug: article.slug,
        content: { blocks: [{ type: "paragraph", text: "اردو باڈی متن۔" }] },
      },
    });

    const result = await searchArticles(term);
    expect(result.articles.some((a) => a.id === article.id)).toBe(false);
  });
});

describe("sitemap — Urdu translations", () => {
  it("includes a published Urdu translation's /ur/ URL, but not an unpublished one", async () => {
    const publishedArticle = await prisma.article.create({
      data: {
        slug: `sitemap-urdu-published-${Date.now()}`,
        title: "Sitemap Urdu published test",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        authorId,
      },
    });
    trackArticle(publishedArticle.id);
    await prisma.articleTranslation.create({
      data: { articleId: publishedArticle.id, status: "PUBLISHED", title: "عنوان", slug: publishedArticle.slug, publishedAt: new Date() },
    });

    const unpublishedArticle = await prisma.article.create({
      data: {
        slug: `sitemap-urdu-unpublished-${Date.now()}`,
        title: "Sitemap Urdu unpublished test",
        content: { blocks: [{ type: "paragraph", text: "Body." }] },
        status: "PUBLISHED",
        publishedAt: new Date(),
        categoryId,
        authorId,
      },
    });
    trackArticle(unpublishedArticle.id);
    await prisma.articleTranslation.create({
      data: { articleId: unpublishedArticle.id, status: "READY", title: "عنوان", slug: unpublishedArticle.slug },
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${siteUrl()}/ur/${publishedArticle.slug}`);
    expect(urls).not.toContain(`${siteUrl()}/ur/${unpublishedArticle.slug}`);
    // English URLs remain present and unaffected.
    expect(urls).toContain(`${siteUrl()}/article/${publishedArticle.slug}`);
  });
});

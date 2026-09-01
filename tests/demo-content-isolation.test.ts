import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { getBreakingArticles, getHeroPool, getLatestPreview } from "../lib/articles";
import { searchArticles } from "../lib/search";
import sitemap from "../app/sitemap";
import { GET as rssRoute } from "../app/rss.xml/route";

// Proves the fix for the session's top production-safety finding: seeded
// demo content (prisma/seed.ts, all status:"PUBLISHED") was reaching every
// public surface, including the site-wide breaking ticker and homepage
// hero, with zero labeling on RSS/sitemap. lib/articles.ts's shared
// PUBLISHED constant now also excludes isDemo:true — this test creates one
// real and one demo article (both breaking + featured, the worst-case
// leak path) and proves only the real one is ever returned.

let categoryId: string;
let authorId: string;
let realArticleId: string;
let demoArticleId: string;
const marker = `demo-isolation-${Date.now()}`;

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow();
  const author = await prisma.author.findFirstOrThrow();
  categoryId = category.id;
  authorId = author.id;

  const real = await prisma.article.create({
    data: {
      slug: `${marker}-real`,
      title: `Real Article ${marker}`,
      excerpt: "A genuine, non-demo article for testing.",
      content: { blocks: [{ type: "paragraph", text: "Real content." }] },
      status: "PUBLISHED",
      isDemo: false,
      isBreaking: true,
      featured: true,
      publishedAt: new Date(),
      categoryId,
      authorId,
    },
  });
  realArticleId = real.id;

  const demo = await prisma.article.create({
    data: {
      slug: `${marker}-demo`,
      title: `Demo Article ${marker}`,
      excerpt: "Seeded placeholder content — must never appear publicly.",
      content: { blocks: [{ type: "paragraph", text: "Placeholder content." }] },
      status: "PUBLISHED",
      isDemo: true,
      isBreaking: true,
      featured: true,
      publishedAt: new Date(),
      categoryId,
      authorId,
    },
  });
  demoArticleId = demo.id;
});

afterAll(async () => {
  await prisma.article.deleteMany({ where: { id: { in: [realArticleId, demoArticleId] } } });
});

describe("demo content isolation — public surfaces", () => {
  it("excludes demo articles from the breaking ticker even when isBreaking:true", async () => {
    const breaking = await getBreakingArticles(50);
    expect(breaking.some((a) => a.id === realArticleId)).toBe(true);
    expect(breaking.some((a) => a.id === demoArticleId)).toBe(false);
  });

  it("excludes demo articles from the homepage hero pool even when featured:true", async () => {
    const pool = await getHeroPool(50);
    expect(pool.some((a) => a.id === realArticleId)).toBe(true);
    expect(pool.some((a) => a.id === demoArticleId)).toBe(false);
  });

  it("excludes demo articles from the latest-news preview", async () => {
    const latest = await getLatestPreview(50);
    expect(latest.some((a) => a.id === realArticleId)).toBe(true);
    expect(latest.some((a) => a.id === demoArticleId)).toBe(false);
  });

  it("excludes demo articles from search results", async () => {
    const result = await searchArticles(marker);
    expect(result.articles.some((a) => a.id === realArticleId)).toBe(true);
    expect(result.articles.some((a) => a.id === demoArticleId)).toBe(false);
  });

  it("excludes demo articles from the sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes(`${marker}-real`))).toBe(true);
    expect(urls.some((u) => u.includes(`${marker}-demo`))).toBe(false);
  });

  it("excludes demo articles from the site-wide RSS feed", async () => {
    const res = await rssRoute();
    const xml = await res.text();
    expect(xml).toContain(`${marker}-real`);
    expect(xml).not.toContain(`${marker}-demo`);
  });
});

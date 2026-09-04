import { describe, it, expect } from "vitest";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { prisma } from "../lib/prisma";

/**
 * The sitemap previously listed every category from a hardcoded constant
 * and stamped lastModified: new Date() on every non-article entry. Three
 * consequences, all visible in the live output:
 *
 *   - empty category pages (cybersecurity, enterprise, space) were being
 *     handed to Google as crawlable thin content;
 *   - /search, an internal search results page, was submitted for indexing
 *     against Google's own guidance;
 *   - every static, category and author URL reported the same lastmod, the
 *     moment of generation, which teaches a crawler the field is worthless
 *     and gets it discounted for the whole site — including the article
 *     entries where it is real.
 */
describe("sitemap", () => {
  it("never lists internal search results", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/search"))).toBe(false);
  });

  it("excludes categories that hold no published article", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    const empty = await prisma.category.findMany({
      where: { articles: { none: { status: "PUBLISHED", isDemo: false } } },
      select: { slug: true },
    });
    for (const c of empty) {
      expect(urls.some((u) => u.endsWith(`/category/${c.slug}`)), `empty category ${c.slug} must not be listed`).toBe(false);
    }
  });

  it("includes every category that does hold one", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const populated = await prisma.category.findMany({
      where: { active: true, articles: { some: { status: "PUBLISHED", isDemo: false } } },
      select: { slug: true },
    });
    for (const c of populated) {
      const expected = c.slug === "pakistan-tech" ? "/pakistan-tech" : `/category/${c.slug}`;
      expect(urls.some((u) => u.endsWith(expected)), `${c.slug} should be listed`).toBe(true);
    }
  });

  it("lists pakistan-tech at its hub URL, not under /category", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/category/pakistan-tech"))).toBe(false);
  });

  it("only lists authors with published work", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const empty = await prisma.author.findMany({
      where: { articles: { none: { status: "PUBLISHED", isDemo: false } } },
      select: { slug: true },
    });
    for (const a of empty) {
      expect(urls.some((u) => u.endsWith(`/author/${a.slug}`)), `author ${a.slug} has no articles`).toBe(false);
    }
  });

  it("does not stamp every entry with the generation time", async () => {
    const entries = await sitemap();
    const stamps = entries.map((e) => e.lastModified).filter(Boolean).map((d) => new Date(d as Date).getTime());

    // The old behaviour: one identical timestamp across most of the file.
    const distinct = new Set(stamps).size;
    expect(distinct, "lastmod values should reflect real content dates, not one generation instant").toBeGreaterThan(1);

    // And nothing should claim to have been modified in the future.
    const now = Date.now() + 60_000;
    for (const t of stamps) expect(t).toBeLessThanOrEqual(now);
  });

  it("omits lastModified on informational pages rather than inventing one", async () => {
    const entries = await sitemap();
    for (const path of ["/about", "/privacy", "/terms", "/contact"]) {
      const entry = entries.find((e) => e.url.endsWith(path));
      expect(entry, `${path} should be listed`).toBeTruthy();
      expect(entry?.lastModified, `${path} has no tracked revision date`).toBeUndefined();
    }
  });

  it("uses absolute canonical URLs with no duplicates", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.every((u) => u.startsWith("http"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lists every published article", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const published = await prisma.article.count({ where: { status: "PUBLISHED", isDemo: false } });
    expect(urls.filter((u) => u.includes("/article/")).length).toBe(published);
  });
});

describe("robots", () => {
  it("blocks internal search alongside admin and the API", () => {
    const rules = robots().rules as { disallow?: string[] };
    expect(rules.disallow).toContain("/search");
    expect(rules.disallow).toContain("/admin");
    expect(rules.disallow).toContain("/api/");
  });

  it("still allows the site itself and points at the sitemap", () => {
    const r = robots();
    expect((r.rules as { allow?: string }).allow).toBe("/");
    expect(String(r.sitemap)).toMatch(/\/sitemap\.xml$/);
  });
});

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { siteUrl, categoryHref } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Informational pages with no tracked revision date. lastModified is
 * omitted for these rather than filled with the current time: a sitemap
 * that reports every page as modified on every fetch teaches Google the
 * field is meaningless, and it then discounts lastmod for the whole site —
 * including the article entries where the value is real and useful.
 *
 * /search is deliberately absent. Internal search result pages are thin,
 * infinitely variable, and Google's own guidance is not to let them be
 * crawled; app/robots.ts disallows the path for the same reason.
 */
const INFORMATIONAL_ROUTES = [
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/advertise",
  "/newsletter",
  "/authors",
];

// Single sitemap is fine at current scale; once article volume grows into the
// thousands, split this into a sitemap index (per spec section 30).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  // Categories and authors come from the database, filtered to those that
  // actually hold published articles. The previous version listed every
  // category in a hardcoded constant, which put empty pages
  // (cybersecurity, enterprise, space) in front of Google as crawlable
  // thin content, and would silently omit any category created later.
  const [articles, categories, authors] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PUBLISHED", isDemo: false },
      select: { slug: true, updatedAt: true, publishedAt: true, categoryId: true, authorId: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.category.findMany({
      where: { active: true, articles: { some: { status: "PUBLISHED", isDemo: false } } },
      select: { id: true, slug: true },
    }),
    prisma.author.findMany({
      where: { articles: { some: { status: "PUBLISHED", isDemo: false } } },
      select: { id: true, slug: true },
    }),
  ]);

  // Articles arrive newest-first, so the first match per group is the most
  // recent — one pass, no per-group queries.
  const newestByCategory = new Map<string, Date>();
  const newestByAuthor = new Map<string, Date>();
  for (const a of articles) {
    const when = a.publishedAt ?? a.updatedAt;
    if (!newestByCategory.has(a.categoryId)) newestByCategory.set(a.categoryId, when);
    if (!newestByAuthor.has(a.authorId)) newestByAuthor.set(a.authorId, when);
  }
  const newestOverall = articles[0]?.publishedAt ?? articles[0]?.updatedAt;

  return [
    // Feeds of newest content: their lastmod is genuinely the newest article.
    { url: `${base}/`, lastModified: newestOverall },
    { url: `${base}/latest`, lastModified: newestOverall },

    ...INFORMATIONAL_ROUTES.map((path) => ({ url: `${base}${path}` })),

    // categoryHref already maps pakistan-tech to its own /pakistan-tech hub
    // rather than /category/pakistan-tech, so no special case is needed and
    // the URL emitted here is the same one the site links to internally.
    ...categories.map((c) => ({ url: `${base}${categoryHref(c.slug)}`, lastModified: newestByCategory.get(c.id) })),

    ...authors.map((a) => ({ url: `${base}/author/${a.slug}`, lastModified: newestByAuthor.get(a.id) })),

    ...articles.map((a) => ({ url: `${base}/article/${a.slug}`, lastModified: a.updatedAt })),
  ];
}

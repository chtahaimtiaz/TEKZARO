import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { siteUrl, CATEGORIES, categoryHref } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATIC_ROUTES = [
  "/",
  "/latest",
  "/search",
  "/authors",
  "/pakistan-tech",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/advertise",
  "/newsletter",
];

// Single sitemap is fine at current scale; once article volume grows into the
// thousands, split this into a sitemap index (per spec section 30).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [articles, authors] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PUBLISHED", isDemo: false },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.author.findMany({ select: { slug: true } }),
  ]);

  return [
    ...STATIC_ROUTES.map((path) => ({ url: `${base}${path}`, lastModified: new Date() })),
    ...CATEGORIES.filter((c) => c.slug !== "pakistan-tech").map((c) => ({
      url: `${base}${categoryHref(c.slug)}`,
      lastModified: new Date(),
    })),
    ...authors.map((a) => ({ url: `${base}/author/${a.slug}`, lastModified: new Date() })),
    ...articles.map((a) => ({ url: `${base}/article/${a.slug}`, lastModified: a.updatedAt })),
  ];
}

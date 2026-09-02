import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";
import { siteUrl, SITE_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Urdu sibling of app/rss.xml/route.ts — same shape, filtered to
 * PUBLISHED translations whose English article is itself published, same
 * bar the sitemap uses. Purely additive: the existing English feed is
 * completely untouched. */
export async function GET() {
  const translations = await prisma.articleTranslation.findMany({
    where: { status: "PUBLISHED", article: { status: "PUBLISHED", isDemo: false } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { article: { include: { author: true, category: true } } },
  });

  const base = siteUrl();
  const feed = buildRssFeed({
    title: `${SITE_NAME} — اردو`,
    description: "ٹیکزارو کی جانب سے تازہ ترین ٹیکنالوجی خبریں، اردو میں۔",
    link: `${base}/ur`,
    selfLink: `${base}/ur/rss.xml`,
    language: "ur-pk",
    items: translations
      .filter((t) => t.title && t.slug)
      .map((t) => ({
        title: t.title!,
        link: `${base}/ur/${t.slug}`,
        description: t.dek || t.metaDescription || "",
        pubDate: t.publishedAt ?? t.createdAt,
        guid: t.id,
        author: t.article.author.name,
        category: t.article.category.name,
      })),
  });

  return new Response(feed, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

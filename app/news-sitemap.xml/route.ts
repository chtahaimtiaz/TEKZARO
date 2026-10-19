import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Google News sitemap — covers articles published in the last 2 days.
 * Google News only indexes articles from the past 2 days via this sitemap.
 * Ref: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
export async function GET() {
  const base = siteUrl();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      isDemo: false,
      publishedAt: { gte: twoDaysAgo },
    },
    select: {
      slug: true,
      title: true,
      publishedAt: true,
      author: { select: { name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  });

  const urls = articles
    .map((a) => {
      const pubDate = a.publishedAt?.toISOString() ?? new Date().toISOString();
      return `
  <url>
    <loc>${base}/article/${a.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>TEKZARO</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(a.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

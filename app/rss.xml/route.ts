import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";
import { siteUrl, SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { author: true, category: true },
  });

  const base = siteUrl();
  const feed = buildRssFeed({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    link: base,
    selfLink: `${base}/rss.xml`,
    items: articles.map((a) => ({
      title: a.title,
      link: `${base}/article/${a.slug}`,
      description: a.excerpt || a.subheadline || "",
      pubDate: a.publishedAt ?? a.createdAt,
      guid: a.id,
      author: a.author.name,
      category: a.category.name,
    })),
  });

  return new Response(feed, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

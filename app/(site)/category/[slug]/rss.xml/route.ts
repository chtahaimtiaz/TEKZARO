import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildRssFeed } from "@/lib/rss";
import { siteUrl, CATEGORY_MAP, categoryHref } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = CATEGORY_MAP[slug];
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!def || !category) notFound();

  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED", isDemo: false, categoryId: category.id },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { author: true },
  });

  const base = siteUrl();
  const feed = buildRssFeed({
    title: `TEKZARO — ${def.name}`,
    description: def.description,
    link: `${base}${categoryHref(slug)}`,
    selfLink: `${base}${categoryHref(slug)}/rss.xml`,
    items: articles.map((a) => ({
      title: a.title,
      link: `${base}/article/${a.slug}`,
      description: a.excerpt || a.subheadline || "",
      pubDate: a.publishedAt ?? a.createdAt,
      guid: a.id,
      author: a.author.name,
      category: def.name,
    })),
  });

  return new Response(feed, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

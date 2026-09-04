import { prisma } from "./lib/prisma";

const BASE = "https://www.tekzaro.co";

function pkt(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

async function main() {
  const article = await prisma.article.findFirstOrThrow({
    where: { status: "PUBLISHED", isDemo: false },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, publishedAt: true, updatedAt: true },
  });

  console.log(`article: ${article.title.slice(0, 60)}`);
  console.log(`stored publishedAt (UTC): ${article.publishedAt?.toISOString()}`);
  console.log(`same instant in PKT:      ${pkt(article.publishedAt!)}`);
  console.log(`what UTC rendering showed: ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(article.publishedAt!)}`);

  const html = await (await fetch(`${BASE}/article/${article.slug}`)).text();

  const expected = pkt(article.publishedAt!);
  const timeMatch = /Published\s*<time dateTime="([^"]+)"[^>]*>([^<]+)<\/time>/.exec(html)
    ?? /<time dateTime="([^"]+)"[^>]*>([^<]+)<\/time>/.exec(html);

  console.log(`\nrendered <time> machine value: ${timeMatch?.[1]}`);
  console.log(`rendered <time> visible text:  ${timeMatch?.[2]}`);
  console.log(`expected PKT text:             ${expected}`);
  console.log(`\nVISIBLE TIME CORRECT: ${html.includes(expected)}`);

  // Machine-readable must remain the absolute instant, unshifted.
  console.log(`machine value is the stored instant: ${timeMatch?.[1] === article.publishedAt?.toISOString()}`);

  // JSON-LD
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  let news: Record<string, unknown> | undefined;
  for (const b of ldBlocks) {
    const parsed = JSON.parse(b[1]);
    for (const n of Array.isArray(parsed) ? parsed : [parsed]) {
      if ((n as Record<string, unknown>)["@type"] === "NewsArticle") news = n as Record<string, unknown>;
    }
  }
  console.log(`\nJSON-LD datePublished: ${news?.datePublished}`);
  console.log(`JSON-LD dateModified:  ${news?.dateModified}`);
  console.log(`datePublished === stored instant: ${news?.datePublished === article.publishedAt?.toISOString()}`);
  console.log(`still ISO-8601 with Z:           ${/Z$/.test(String(news?.datePublished))}`);

  // Feeds must stay absolute too.
  const rss = await (await fetch(`${BASE}/rss.xml`)).text();
  const pubDate = /<pubDate>([^<]+)<\/pubDate>/.exec(rss)?.[1];
  console.log(`\nRSS pubDate: ${pubDate}`);
  console.log(`RSS parses to a real instant: ${!Number.isNaN(new Date(pubDate ?? "").getTime())}`);

  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(sitemap)?.[1];
  console.log(`sitemap lastmod: ${lastmod}  valid: ${!Number.isNaN(new Date(lastmod ?? "").getTime())}`);

  console.log(`\ncurrent time now — UTC: ${new Date().toISOString()}   PKT: ${pkt(new Date())}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

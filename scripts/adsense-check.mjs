import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const [statusCounts, articles, recent5] = await Promise.all([
  prisma.article.groupBy({ by: ["status"], _count: { id: true } }),
  prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { title: true, slug: true, excerpt: true, readingTime: true, content: true },
  }),
  prisma.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { title: true, readingTime: true, excerpt: true, subheadline: true },
  }),
]);

console.log("=== Article Status Counts ===");
for (const s of statusCounts) console.log(s.status, s._count.id);

// Estimate word count from readingTime (200 wpm) or content length
function estimateWords(article) {
  if (article.readingTime) return article.readingTime * 200;
  // rough estimate from JSON content length
  if (article.content) return Math.round(JSON.stringify(article.content).length / 6);
  return 0;
}

const words = articles.map(estimateWords);
const avg = words.length ? words.reduce((a, b) => a + b, 0) / words.length : 0;
const thin200 = words.filter((w) => w < 200).length;
const thin300 = words.filter((w) => w < 300).length;
const noExcerpt = articles.filter((a) => !a.excerpt || a.excerpt.trim().length < 20).length;

console.log("\n=== Content Quality ===");
console.log("Total published:", words.length);
console.log("Avg estimated word count:", Math.round(avg));
console.log("Thin (<200 words):", thin200);
console.log("Thin (<300 words):", thin300);
console.log("Missing/short excerpt:", noExcerpt);

console.log("\n=== 5 Most Recent Articles ===");
for (const a of recent5) {
  const wc = a.readingTime ? a.readingTime * 200 : "?";
  console.log(`  "${a.title}" | readingTime:${a.readingTime}min | has_excerpt:${!!(a.excerpt && a.excerpt.length > 20)} | has_sub:${!!a.subheadline}`);
}

await prisma.$disconnect();

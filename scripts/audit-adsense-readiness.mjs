import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log("=== TEKZARO ADSENSE AUDIT ===");

  const allArticles = await prisma.article.findMany({
    include: {
      author: true,
      category: true,
      tags: { include: { tag: true } },
      sources: { include: { source: true } },
    },
  });

  const published = allArticles.filter((a) => a.status === "PUBLISHED");
  console.log(`Total Published Articles: ${published.length}`);

  let under300 = 0;
  let under500 = 0;
  let under800 = 0;
  let goodLength = 0;
  const wordCounts = [];

  for (const a of published) {
    let wordCount = 0;
    const blocks = a.content && typeof a.content === "object" ? a.content.blocks : [];
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b && typeof b === "object") {
          if (typeof b.text === "string") {
            wordCount += b.text.trim().split(/\s+/).filter(Boolean).length;
          }
          if (Array.isArray(b.items)) {
            for (const item of b.items) {
              if (typeof item === "string") {
                wordCount += item.trim().split(/\s+/).filter(Boolean).length;
              } else if (item && typeof item === "object") {
                if (typeof item.question === "string") wordCount += item.question.trim().split(/\s+/).filter(Boolean).length;
                if (typeof item.answer === "string") wordCount += item.answer.trim().split(/\s+/).filter(Boolean).length;
              }
            }
          }
        }
      }
    }
    wordCounts.push({ slug: a.slug, title: a.title, wordCount, category: a.category?.slug, author: a.author?.name });
    if (wordCount < 300) under300++;
    else if (wordCount < 500) under500++;
    else if (wordCount < 800) under800++;
    else goodLength++;
  }

  wordCounts.sort((a, b) => a.wordCount - b.wordCount);

  console.log(`\nWord Count Distribution:`);
  console.log(`Under 300 words (Critically thin): ${under300}`);
  console.log(`300-500 words (Borderline thin): ${under500}`);
  console.log(`500-800 words (Standard): ${under800}`);
  console.log(`800+ words (Comprehensive): ${goodLength}`);

  console.log(`\nShortest 10 published articles:`);
  for (const w of wordCounts.slice(0, 10)) {
    console.log(`- [${w.wordCount} words] (${w.category}) ${w.title?.substring(0, 50)}...`);
  }

  console.log(`\nLongest 5 published articles:`);
  for (const w of wordCounts.slice(-5)) {
    console.log(`- [${w.wordCount} words] (${w.category}) ${w.title?.substring(0, 50)}...`);
  }

  // Check verification
  const unverified = published.filter(a => a.verificationStatus !== "PRIMARY_SOURCE_CONFIRMED");
  console.log(`\nVerification Status:`);
  console.log(`PRIMARY_SOURCE_CONFIRMED: ${published.length - unverified.length}`);
  console.log(`UNVERIFIED / OTHER: ${unverified.length}`);

  // Check categories with article counts
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          articles: { where: { status: "PUBLISHED" } }
        }
      }
    }
  });

  console.log(`\nCategories Breakdown:`);
  for (const c of categories) {
    console.log(`- ${c.name} (${c.slug}): ${c._count.articles} articles`);
  }

  // Check tags
  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: {
          articles: { where: { article: { status: "PUBLISHED" } } }
        }
      }
    }
  });
  console.log(`\nTotal Tags: ${tags.length}`);
  const tagsWith0 = tags.filter(t => t._count.articles === 0);
  const tagsWith1 = tags.filter(t => t._count.articles === 1);
  console.log(`Tags with 0 published articles: ${tagsWith0.length}`);
  console.log(`Tags with only 1 published article: ${tagsWith1.length}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

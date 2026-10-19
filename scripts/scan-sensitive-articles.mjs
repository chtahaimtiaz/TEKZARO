import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  const published = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, category: { select: { slug: true } } },
  });

  const sensitiveKeywords = [
    "kill", "killed", "murder", "death penalty", "blasphem", "assault", "rape",
    "kidnap", "looted", "betting tip", "gambling", "casino", "protest",
    "vandalised", "sexual", "terrorist", "corpse", "dead body"
  ];

  console.log("=== SENSITIVE / VIOLENT / NON-TECH CONTENT AUDIT ===");
  const flagged = [];

  for (const a of published) {
    const lower = a.title.toLowerCase();
    for (const kw of sensitiveKeywords) {
      if (lower.includes(kw)) {
        flagged.push({ id: a.id, slug: a.slug, title: a.title, kw });
        break;
      }
    }
  }

  console.log(`Found ${flagged.length} flagged articles:`);
  for (const f of flagged) {
    console.log(`- [${f.kw}] ${f.title} (slug: ${f.slug})`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

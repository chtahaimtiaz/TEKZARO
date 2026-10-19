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
    select: {
      id: true,
      title: true,
      slug: true,
      category: { select: { slug: true } },
      sources: { select: { source: { select: { name: true } } } },
      pakistanRelevance: true,
      readingTime: true,
      autoPublished: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total published: ${published.length}`);
  for (const a of published) {
    const src = a.sources.map(s => s.source.name).join(", ");
    console.log(`[${a.category?.slug}] [${src || 'NO_SRC'}] ${a.title} (${a.slug})`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

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
    select: { id: true, featuredImageUrl: true },
  });

  const withImage = published.filter(a => a.featuredImageUrl && a.featuredImageUrl.length > 5);
  console.log(`Published with featured image: ${withImage.length} / ${published.length}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

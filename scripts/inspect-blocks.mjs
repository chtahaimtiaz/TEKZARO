import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    take: 3,
  });

  for (const a of articles) {
    console.log("=== ARTICLE:", a.title, "===");
    console.log("Type of content:", typeof a.content);
    console.log("Content raw:", JSON.stringify(a.content, null, 2));
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

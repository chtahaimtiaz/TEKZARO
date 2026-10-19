import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  const authors = await prisma.author.findMany({
    include: {
      _count: { select: { articles: true } }
    }
  });
  console.log(JSON.stringify(authors, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());

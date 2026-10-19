import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  const counts = await prisma.sourceItem.groupBy({ by: ["status"], _count: { id: true } });
  console.log("SourceItem status counts:", counts);

  const newItems = await prisma.sourceItem.findMany({
    where: { status: "NEW" },
    select: { id: true, headline: true, priorityScore: true },
    take: 20,
  });
  console.log(`Sample NEW items (${newItems.length} found):`);
  for (const n of newItems) {
    console.log(`- [priority: ${n.priorityScore}] ${n.headline}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

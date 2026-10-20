import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  // Check if author already exists to avoid duplicates
  const existing = await prisma.author.findUnique({ where: { slug: "taha-imtiaz" } });
  if (existing) {
    console.log("Author 'taha-imtiaz' already exists:", existing.id);
    return;
  }

  const author = await prisma.author.create({
    data: {
      name: "Taha Imtiaz",
      slug: "taha-imtiaz",
      position: "Founder & Publisher",
      bio: "Taha Imtiaz founded TEKZARO with a focus on independent, fact-checked technology journalism for Pakistan and the wider region. He oversees the publication's editorial direction and strategy.",
      active: true,
    },
  });
  console.log("Created founder author:", author.id);
}

run().catch(console.error).finally(() => prisma.$disconnect());

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  const author = await prisma.author.upsert({
    where: { slug: "taha-imtiaz" },
    update: {
      position: "Founder & Owner",
      bio: "Taha Imtiaz is the founder and owner of TEKZARO, established with a focus on independent, fact-checked technology journalism for Pakistan and the global technology ecosystem. He oversees the publication's strategic growth, ownership, and editorial standards.",
      active: true,
    },
    create: {
      name: "Taha Imtiaz",
      slug: "taha-imtiaz",
      position: "Founder & Owner",
      bio: "Taha Imtiaz is the founder and owner of TEKZARO, established with a focus on independent, fact-checked technology journalism for Pakistan and the global technology ecosystem. He oversees the publication's strategic growth, ownership, and editorial standards.",
      active: true,
    },
  });
  console.log("Upserted founder & owner author:", author.id, author.position);
}

run().catch(console.error).finally(() => prisma.$disconnect());

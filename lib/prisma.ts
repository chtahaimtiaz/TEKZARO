import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __tekzaroPrisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we don't exhaust Postgres connections.
export const prisma = global.__tekzaroPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__tekzaroPrisma = prisma;
}

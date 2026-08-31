import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __tekzaroPrisma: PrismaClient | undefined;
}

function createClient() {
  // Explicit ssl option rather than relying on ?sslmode=require in the
  // connection string: Prisma 7's pg-based driver adapter (unlike the old
  // Rust query engine) hands the string straight to node-postgres, whose
  // own sslmode parsing has been unreliable across environments. true
  // still validates the server certificate against Node's trusted CA
  // store (Neon's cert is properly signed) -- this isn't a security
  // downgrade, just making the TLS requirement unambiguous.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, ssl: true });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we don't exhaust Postgres connections.
export const prisma = global.__tekzaroPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__tekzaroPrisma = prisma;
}

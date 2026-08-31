import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

declare global {
  // eslint-disable-next-line no-var
  var __tekzaroPrisma: PrismaClient | undefined;
}

// Neon's HTTPS-based serverless driver rather than raw TCP (@prisma/adapter-pg
// + node-postgres, used previously): production deploys on Vercel could not
// reach the database at all over TCP (consistent P1001/DatabaseNotReachable
// on every query, unaffected by connection-string or SSL-config changes) —
// most likely a network-level restriction on the TCP path that plain HTTPS
// isn't subject to. Bundles its own transport; no separate `pg`/`ws` needed.
function createClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we don't exhaust Postgres connections.
export const prisma = global.__tekzaroPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__tekzaroPrisma = prisma;
}

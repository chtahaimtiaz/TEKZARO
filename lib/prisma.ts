import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

// @prisma/adapter-neon exports two adapters: `PrismaNeonHttp` (stateless,
// one HTTPS request per query — tried first, but Prisma's query engine
// wraps nested writes in an implicit transaction even with no explicit
// $transaction call anywhere in this codebase, and PrismaNeonHttp throws
// "Transactions are not supported in HTTP mode") and `PrismaNeon` (Pool/
// WebSocket-based, transactions supported). Using the latter — it still
// needs an explicit WebSocket constructor wired up, which is easy to miss
// (an earlier attempt without this line failed with a confusing
// "Invalid URL" error at query time, not at construction).
neonConfig.webSocketConstructor = ws;

declare global {
  // eslint-disable-next-line no-var
  var __tekzaroPrisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we don't exhaust Postgres connections.
export const prisma = global.__tekzaroPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__tekzaroPrisma = prisma;
}

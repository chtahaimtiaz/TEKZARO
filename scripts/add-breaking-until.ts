/**
 * One-time column migration — runs directly via the Neon serverless driver,
 * bypassing the Prisma singleton so dotenv runs first.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
config({ path: resolve(process.cwd(), ".env"), override: false });

import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({ connectionString: url });

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE "Article"
      ADD COLUMN IF NOT EXISTS "breakingUntil" TIMESTAMP(3);
    `);
    console.log("✓ breakingUntil column added (or already existed)");

    const res = await client.query(`
      UPDATE "Article"
      SET "breakingUntil" = COALESCE("publishedAt", NOW()) + INTERVAL '24 hours'
      WHERE "isBreaking" = true
        AND "breakingUntil" IS NULL;
    `);
    console.log(`✓ Backfilled ${res.rowCount ?? 0} breaking article(s) with 24-hour expiry`);
  } finally {
    client.release();
    await pool.end();
  }
  console.log("Migration complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });

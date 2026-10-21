import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local"), override: true });
config({ path: resolve(process.cwd(), ".env"), override: false });

import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE "Author"
      ADD COLUMN IF NOT EXISTS "isPublicAuthor" BOOLEAN NOT NULL DEFAULT true;
    `);
    console.log("✓ isPublicAuthor column added to Author table (or already existed)");

    const res = await client.query(`
      UPDATE "Author"
      SET "isPublicAuthor" = false
      WHERE "slug" = 'taha-imtiaz'
         OR "position" ILIKE '%founder%'
         OR "position" ILIKE '%owner%';
    `);
    console.log(`✓ Set isPublicAuthor = false for ${res.rowCount ?? 0} non-journalist founder/owner profile(s)`);

    const authors = await client.query(`
      SELECT "id", "name", "slug", "position", "isPublicAuthor"
      FROM "Author"
      ORDER BY "name" ASC;
    `);
    console.log("Current Author eligibility:");
    console.table(authors.rows);
  } finally {
    client.release();
    await pool.end();
  }
  console.log("Migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

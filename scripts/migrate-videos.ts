import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Checking and creating VideoStatus enum...");
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("VideoStatus enum ready.");
  } catch (err: any) {
    console.log("Enum notice:", err.message);
  }

  console.log("Creating Video table if not exists...");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Video" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "videoUrl" TEXT NOT NULL,
      "thumbnailUrl" TEXT,
      "duration" TEXT,
      "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
      "featured" BOOLEAN NOT NULL DEFAULT false,
      "views" INTEGER NOT NULL DEFAULT 0,
      "categoryId" TEXT NOT NULL REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "authorId" TEXT NOT NULL REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "publishedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Video_slug_key" ON "Video"("slug");
    CREATE INDEX IF NOT EXISTS "Video_status_publishedAt_idx" ON "Video"("status", "publishedAt");
    CREATE INDEX IF NOT EXISTS "Video_categoryId_publishedAt_idx" ON "Video"("categoryId", "publishedAt");
  `);

  console.log("Video table and indexes successfully ensured!");
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

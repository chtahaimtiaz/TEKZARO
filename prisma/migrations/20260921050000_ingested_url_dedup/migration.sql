-- CreateTable
CREATE TABLE "IngestedUrl" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedUrl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestedUrl_sourceId_sourceUrl_key" ON "IngestedUrl"("sourceId", "sourceUrl");

-- Backfill: every (sourceId, sourceUrl) pair from the SourceItem rows that
-- exist right now becomes a permanent "already seen" fingerprint. Without
-- this, the very next ingestion run would treat every currently-live
-- SourceItem's URL as unseen and skip nothing — this migration only
-- protects URLs already fingerprinted going forward, not URLs whose only
-- SourceItem row was already deleted before this ran.
INSERT INTO "IngestedUrl" ("id", "sourceId", "sourceUrl", "createdAt")
SELECT gen_random_uuid()::text, "sourceId", "sourceUrl", MIN("createdAt")
FROM "SourceItem"
GROUP BY "sourceId", "sourceUrl"
ON CONFLICT ("sourceId", "sourceUrl") DO NOTHING;

-- CreateEnum
CREATE TYPE "ImageReuseStatus" AS ENUM ('UNKNOWN', 'ALLOWED', 'LICENSED', 'OWNED', 'GENERATED', 'REQUIRES_REVIEW', 'REJECTED');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "featuredMediaId" TEXT;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "reuseNotes" TEXT,
ADD COLUMN     "reuseStatus" "ImageReuseStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "selectionReasons" JSONB,
ADD COLUMN     "selectionScore" DOUBLE PRECISION,
ADD COLUMN     "sourceArticleUrl" TEXT,
ADD COLUMN     "sourceDomain" TEXT,
ADD COLUMN     "sourceItemId" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Media_contentHash_key" ON "Media"("contentHash");

-- CreateIndex
CREATE INDEX "Media_sourceItemId_idx" ON "Media"("sourceItemId");

-- CreateIndex
CREATE INDEX "Media_reuseStatus_idx" ON "Media"("reuseStatus");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_featuredMediaId_fkey" FOREIGN KEY ("featuredMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

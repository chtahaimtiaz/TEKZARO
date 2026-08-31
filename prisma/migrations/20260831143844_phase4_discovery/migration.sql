-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "DiscoveryStatus" AS ENUM ('NEW', 'REVIEWING', 'VERIFIED', 'DUPLICATE', 'POSSIBLE_DUPLICATE', 'REJECTED', 'CONVERTED_TO_DRAFT');

-- CreateEnum
CREATE TYPE "PakistanImpactLevel" AS ENUM ('DIRECT', 'HIGH', 'MODERATE', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('FACT', 'CLAIM', 'SPECULATION', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ClaimStance" AS ENUM ('SUPPORTING', 'CONTRADICTING');

-- CreateEnum
CREATE TYPE "AITask" AS ENUM ('SUMMARIZE', 'EXTRACT_ENTITIES', 'CLASSIFY_TOPIC', 'EXTRACT_CLAIMS', 'HEADLINE_SUGGESTIONS', 'PAKISTAN_IMPACT', 'INTERNAL_LINKS');

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('PAKISTAN', 'COMPANY', 'TOPIC');

-- CreateEnum
CREATE TYPE "DigestSection" AS ENUM ('PAKISTAN', 'REGIONAL', 'GLOBAL');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('DRAFT', 'READY');

-- AlterTable
-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index — deliberately not touching it, unlike the raw diff
-- output which wanted to drop the index and clear a "default" it doesn't have.)
ALTER TABLE "Source" DROP COLUMN "errorStatus",
DROP COLUMN "reliability",
ADD COLUMN     "country" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "reliabilityNotes" TEXT,
ADD COLUMN     "tier" "SourceTier" NOT NULL DEFAULT 'TIER_3',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SourceItem" ADD COLUMN     "aiStatus" "AIStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "convertedArticleId" TEXT,
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "duplicateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "normalizedTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pakistanImpactLevel" "PakistanImpactLevel",
ADD COLUMN     "pakistanImpactReasons" JSONB,
ADD COLUMN     "pakistanRelevance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priorityReasons" JSONB,
ADD COLUMN     "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "DiscoveryStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SourceItem" ALTER COLUMN "normalizedTitle" DROP DEFAULT;
ALTER TABLE "SourceItem" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Source" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoryCluster" ADD COLUMN     "pakistanImpactLevel" "PakistanImpactLevel",
ADD COLUMN     "pakistanRelevance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "ClaimType" NOT NULL DEFAULT 'CLAIM',
    "resolved" BOOLEAN NOT NULL DEFAULT true,
    "resolutionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimSource" (
    "claimId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "stance" "ClaimStance" NOT NULL,

    CONSTRAINT "ClaimSource_pkey" PRIMARY KEY ("claimId","sourceItemId")
);

-- CreateTable
CREATE TABLE "AIGeneration" (
    "id" TEXT NOT NULL,
    "task" "AITask" NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AIStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "requestedById" TEXT NOT NULL,
    "inputRef" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "type" "KeywordType" NOT NULL,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "digestDate" TIMESTAMP(3) NOT NULL,
    "status" "DigestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestItem" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "articleId" TEXT,
    "section" "DigestSection" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_term_key" ON "Keyword"("term");

-- CreateIndex
CREATE UNIQUE INDEX "Digest_digestDate_key" ON "Digest"("digestDate");

-- CreateIndex
CREATE INDEX "SourceItem_status_idx" ON "SourceItem"("status");

-- CreateIndex
CREATE INDEX "SourceItem_clusterId_idx" ON "SourceItem"("clusterId");

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_convertedArticleId_fkey" FOREIGN KEY ("convertedArticleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSource" ADD CONSTRAINT "ClaimSource_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSource" ADD CONSTRAINT "ClaimSource_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneration" ADD CONSTRAINT "AIGeneration_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "Digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestItem" ADD CONSTRAINT "DigestItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "EvidenceClaimType" AS ENUM ('DIRECT_FACT', 'ATTRIBUTED_CLAIM', 'DERIVED_FACT', 'ANALYSIS', 'UNCERTAIN', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "EvidenceRetrievalStatus" AS ENUM ('OK', 'ROBOTS_BLOCKED', 'HTTP_ERROR', 'TOO_SHORT', 'AGGREGATOR_SKIPPED', 'FETCH_ERROR');

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "articleId" TEXT,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "hostname" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "rankLabel" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "publishedAt" TEXT,
    "extractedText" TEXT,
    "extractionLength" INTEGER NOT NULL DEFAULT 0,
    "isOriginatingOutlet" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isCorroborating" BOOLEAN NOT NULL DEFAULT false,
    "retrievalStatus" "EvidenceRetrievalStatus" NOT NULL DEFAULT 'OK',
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleClaim" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "articleId" TEXT,
    "claimText" TEXT NOT NULL,
    "claimType" "EvidenceClaimType" NOT NULL,
    "supportingEvidenceId" TEXT,
    "sourceExcerpt" TEXT,
    "isDerived" BOOLEAN NOT NULL DEFAULT false,
    "derivedFromValues" JSONB,
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationMetric" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "articleId" TEXT,
    "modelId" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "primarySourceCount" INTEGER NOT NULL DEFAULT 0,
    "secondarySourceCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCharCount" INTEGER NOT NULL DEFAULT 0,
    "articleWordCount" INTEGER,
    "headingCount" INTEGER,
    "evidenceRichness" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "qualityFailures" JSONB,
    "sourceConflicts" JSONB,
    "jsonParseOk" BOOLEAN NOT NULL DEFAULT true,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "sentToReview" BOOLEAN NOT NULL DEFAULT false,
    "autoPublished" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceRecord_generationId_idx" ON "EvidenceRecord"("generationId");

-- CreateIndex
CREATE INDEX "EvidenceRecord_articleId_idx" ON "EvidenceRecord"("articleId");

-- CreateIndex
CREATE INDEX "EvidenceRecord_hostname_idx" ON "EvidenceRecord"("hostname");

-- CreateIndex
CREATE INDEX "ArticleClaim_generationId_idx" ON "ArticleClaim"("generationId");

-- CreateIndex
CREATE INDEX "ArticleClaim_articleId_idx" ON "ArticleClaim"("articleId");

-- CreateIndex
CREATE INDEX "ArticleClaim_claimType_idx" ON "ArticleClaim"("claimType");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationMetric_generationId_key" ON "GenerationMetric"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationMetric_articleId_key" ON "GenerationMetric"("articleId");

-- CreateIndex
CREATE INDEX "GenerationMetric_modelId_idx" ON "GenerationMetric"("modelId");

-- CreateIndex
CREATE INDEX "GenerationMetric_createdAt_idx" ON "GenerationMetric"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationMetric_evidenceRichness_idx" ON "GenerationMetric"("evidenceRichness");

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AIGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleClaim" ADD CONSTRAINT "ArticleClaim_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AIGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleClaim" ADD CONSTRAINT "ArticleClaim_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleClaim" ADD CONSTRAINT "ArticleClaim_supportingEvidenceId_fkey" FOREIGN KEY ("supportingEvidenceId") REFERENCES "EvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationMetric" ADD CONSTRAINT "GenerationMetric_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AIGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationMetric" ADD CONSTRAINT "GenerationMetric_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;



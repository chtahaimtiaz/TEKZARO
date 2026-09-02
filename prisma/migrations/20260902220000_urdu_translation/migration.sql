-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'GENERATING', 'READY', 'PUBLISHED', 'FAILED', 'OUTDATED');

-- AlterEnum
ALTER TYPE "AITask" ADD VALUE 'TRANSLATE_URDU';

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ur',
    "status" "TranslationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "title" TEXT,
    "slug" TEXT,
    "dek" TEXT,
    "content" JSONB,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "socialTitle" TEXT,
    "socialDescription" TEXT,
    "generationId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedById" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("dek", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("content"::text, '')), 'C')
    ) STORED,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_key" ON "ArticleTranslation"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_slug_key" ON "ArticleTranslation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_generationId_key" ON "ArticleTranslation"("generationId");

-- CreateIndex
CREATE INDEX "ArticleTranslation_status_idx" ON "ArticleTranslation"("status");

-- CreateIndex
CREATE INDEX "ArticleTranslation_searchVector_idx" ON "ArticleTranslation" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "AIGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

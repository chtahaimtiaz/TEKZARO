-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'GOOGLE_NEWS';

-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it,
-- unlike the raw diff output which wanted to drop the index and clear a
-- "default" it doesn't have.)
ALTER TABLE "Article" ADD COLUMN     "claimsChecked" JSONB,
ADD COLUMN     "secondarySourceUrl" TEXT,
ADD COLUMN     "verificationConfidence" INTEGER,
ADD COLUMN     "verificationGenerationId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Article_verificationGenerationId_key" ON "Article"("verificationGenerationId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_verificationGenerationId_fkey" FOREIGN KEY ("verificationGenerationId") REFERENCES "AIGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

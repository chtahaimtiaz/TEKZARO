-- AlterTable
-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it,
-- unlike the raw diff output which wanted to drop the index and clear a
-- "default" it doesn't have.)
ALTER TABLE "Article" ADD COLUMN     "authorEligibilityOverridden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Author" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dailyTarget" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "minQualityNote" TEXT,
ADD COLUMN     "participatesInQuota" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requirePrimarySourceVerification" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EditorialSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AuthorCategoryEligibility" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AuthorCategoryEligibility_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AuthorCategoryEligibility_B_index" ON "_AuthorCategoryEligibility"("B");

-- AddForeignKey
ALTER TABLE "_AuthorCategoryEligibility" ADD CONSTRAINT "_AuthorCategoryEligibility_A_fkey" FOREIGN KEY ("A") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AuthorCategoryEligibility" ADD CONSTRAINT "_AuthorCategoryEligibility_B_fkey" FOREIGN KEY ("B") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

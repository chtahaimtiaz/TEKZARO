-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it,
-- unlike the raw diff output which wanted to drop the index and clear a
-- "default" it doesn't have.)

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "articleId" TEXT;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

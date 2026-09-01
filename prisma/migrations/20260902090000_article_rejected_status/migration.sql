-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it,
-- unlike the raw diff output which wanted to drop the index and clear a
-- "default" it doesn't have.)

-- AlterEnum
ALTER TYPE "ArticleStatus" ADD VALUE 'REJECTED';

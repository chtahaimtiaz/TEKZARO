-- CreateEnum
CREATE TYPE "ArticleVerificationStatus" AS ENUM ('UNVERIFIED', 'PRIMARY_SOURCE_CONFIRMED', 'PRIMARY_SOURCE_NOT_FOUND', 'CONTRADICTION_FOUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "AITask" ADD VALUE 'VERIFY_PRIMARY_SOURCE';
ALTER TYPE "AITask" ADD VALUE 'SYNTHESIZE_ARTICLE';

-- AlterTable
-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it,
-- unlike the raw diff output which wanted to drop the index and clear a
-- "default" it doesn't have.)
ALTER TABLE "Article" ADD COLUMN     "autoPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primarySourceUrl" TEXT,
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verificationStatus" "ArticleVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- AlterEnum
BEGIN;
CREATE TYPE "ArticleStatus_new" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
ALTER TABLE "public"."Article" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Article" ALTER COLUMN "status" TYPE "ArticleStatus_new" USING ("status"::text::"ArticleStatus_new");
ALTER TYPE "ArticleStatus" RENAME TO "ArticleStatus_old";
ALTER TYPE "ArticleStatus_new" RENAME TO "ArticleStatus";
DROP TYPE "public"."ArticleStatus_old";
ALTER TABLE "Article" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'EDITOR', 'REPORTER', 'RESEARCHER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'REPORTER';
COMMIT;

-- AlterTable
-- (searchVector is a hand-managed GENERATED ALWAYS AS ... STORED column with
-- its own GIN index from the init migration; Prisma's diff can't see either
-- since the field is declared Unsupported() — deliberately NOT touching it
-- here, unlike the raw diff output which wanted to drop the index.)
ALTER TABLE "Article" ADD COLUMN "createdById" TEXT,
ADD COLUMN "locationName" TEXT;

-- AlterTable
ALTER TABLE "ArticleVersion" DROP COLUMN "content",
ADD COLUMN     "changeSummary" TEXT,
ADD COLUMN     "snapshot" JSONB NOT NULL,
ADD COLUMN     "status" "ArticleStatus" NOT NULL,
ADD COLUMN     "versionNumber" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ALTER COLUMN "role" SET DEFAULT 'REPORTER';

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "ArticleVersion_articleId_createdAt_idx" ON "ArticleVersion"("articleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleVersion_articleId_versionNumber_key" ON "ArticleVersion"("articleId", "versionNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

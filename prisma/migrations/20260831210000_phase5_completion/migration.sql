-- CreateEnum
CREATE TYPE "NewsletterSubscriberStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

-- AlterTable (data-preserving: backfill status from the old `active` column
-- before dropping it, rather than blindly defaulting every existing row to
-- PENDING, which would force real prior single-opt-in subscribers through
-- pointless re-confirmation)
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "status" "NewsletterSubscriberStatus";
UPDATE "NewsletterSubscriber" SET "status" = CASE WHEN "active" THEN 'CONFIRMED' ELSE 'UNSUBSCRIBED' END::"NewsletterSubscriberStatus";
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "NewsletterSubscriber" DROP COLUMN "active";

-- CreateTable
CREATE TABLE "NewsletterConfirmationToken" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterConfirmationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterConfirmationToken_tokenHash_key" ON "NewsletterConfirmationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "NewsletterConfirmationToken_subscriberId_idx" ON "NewsletterConfirmationToken"("subscriberId");

-- AddForeignKey
ALTER TABLE "NewsletterConfirmationToken" ADD CONSTRAINT "NewsletterConfirmationToken_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "NewsletterSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

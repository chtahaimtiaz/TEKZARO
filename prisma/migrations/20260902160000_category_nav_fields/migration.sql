-- AlterTable
ALTER TABLE "Category" ADD COLUMN "navPriority" INTEGER,
ADD COLUMN "showInPrimaryNav" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customRoute" TEXT;

-- Backfill: matches today's lib/constants.ts PRIMARY_NAV/OVERFLOW_NAV order
-- and the pakistan-tech custom-route special case exactly, so public nav
-- renders identically the moment this ships -- zero visual regression at
-- cutover.
UPDATE "Category" SET "navPriority" = 1, "showInPrimaryNav" = true, "customRoute" = '/pakistan-tech' WHERE "slug" = 'pakistan-tech';
UPDATE "Category" SET "navPriority" = 2, "showInPrimaryNav" = true WHERE "slug" = 'ai';
UPDATE "Category" SET "navPriority" = 3, "showInPrimaryNav" = true WHERE "slug" = 'smartphones';
UPDATE "Category" SET "navPriority" = 4, "showInPrimaryNav" = true WHERE "slug" = 'computing';
UPDATE "Category" SET "navPriority" = 5, "showInPrimaryNav" = true WHERE "slug" = 'cybersecurity';
UPDATE "Category" SET "navPriority" = 6, "showInPrimaryNav" = false WHERE "slug" = 'gadgets';
UPDATE "Category" SET "navPriority" = 7, "showInPrimaryNav" = false WHERE "slug" = 'software';
UPDATE "Category" SET "navPriority" = 8, "showInPrimaryNav" = false WHERE "slug" = 'gaming';
UPDATE "Category" SET "navPriority" = 9, "showInPrimaryNav" = false WHERE "slug" = 'startups';
UPDATE "Category" SET "navPriority" = 10, "showInPrimaryNav" = false WHERE "slug" = 'space';
UPDATE "Category" SET "navPriority" = 11, "showInPrimaryNav" = false WHERE "slug" = 'enterprise';

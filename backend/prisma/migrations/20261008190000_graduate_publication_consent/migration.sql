-- Part 10.9 — a Quran graduate's name/photo is published only by an explicit
-- admin decision AND with a recorded consent (the graduate's, or the
-- guardian's for a minor). New graduates start unpublished.

-- CreateEnum
CREATE TYPE "ConsentGiver" AS ENUM ('GRADUATE', 'GUARDIAN');

-- AlterTable
ALTER TABLE "quran_graduates" ADD COLUMN     "consentGivenBy" "ConsentGiver",
ADD COLUMN     "consentRecordedAt" TIMESTAMPTZ(3),
ADD COLUMN     "consentRecordedByUserId" UUID,
ALTER COLUMN "isPublished" SET DEFAULT false;

-- AddForeignKey
ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_consentRecordedByUserId_fkey" FOREIGN KEY ("consentRecordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing rows published without a consent (none at the time of writing)
-- are unpublished rather than deleted, so the CHECK below can hold.
UPDATE "quran_graduates" SET "isPublished" = false
WHERE "isPublished" AND "consentRecordedAt" IS NULL;

ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_consent_check" CHECK (
  ("consentGivenBy" IS NULL AND "consentRecordedAt" IS NULL AND "consentRecordedByUserId" IS NULL)
  OR ("consentGivenBy" IS NOT NULL AND "consentRecordedAt" IS NOT NULL AND "consentRecordedByUserId" IS NOT NULL)
);
ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_published_consent_check"
  CHECK (NOT "isPublished" OR "consentRecordedAt" IS NOT NULL);

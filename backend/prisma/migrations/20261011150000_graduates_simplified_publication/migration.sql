-- Simplified graduate management (الخاتمون): the graduation YEAR is the only
-- date information entered; publication no longer depends on a consent
-- recorded in the platform (the association obtains it outside the form);
-- new graduates are published. Non-destructive: no row or column is deleted,
-- historical dates and consent records stay as stored.

-- A graduate known only by a full date gets that date's year (same fact,
-- nothing invented); the date itself is kept.
UPDATE "quran_graduates"
SET "completionYear" = EXTRACT(YEAR FROM "completionDate")::smallint
WHERE "completionYear" IS NULL AND "completionDate" IS NOT NULL;

-- Publication no longer requires a recorded consent. The consistency of the
-- consent columns themselves (quran_graduates_consent_check) is kept.
ALTER TABLE "quran_graduates" DROP CONSTRAINT "quran_graduates_published_consent_check";

-- New graduates are published by default
ALTER TABLE "quran_graduates" ALTER COLUMN "isPublished" SET DEFAULT true;

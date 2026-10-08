-- Part 10.8 (scheduling): publication becomes an INSTANT. publishedAt (was the
-- "visible from" DATE) is now the actual publication instant, null until
-- published; scheduledFor holds a pending scheduled publication. firstPublishedAt
-- is redundant with publishedAt. The announcements table is empty in every
-- environment before this migration (Part 10.8 is not deployed yet).

-- Old lifecycle rules (they reference the columns changed below)
DROP TRIGGER announcements_guard ON "announcements";
DROP FUNCTION announcements_guard();
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_lifecycle_check";
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_dates_check";

-- AlterTable
ALTER TABLE "announcements" DROP COLUMN "firstPublishedAt",
ADD COLUMN     "scheduledFor" TIMESTAMPTZ(3),
ALTER COLUMN "publishedAt" DROP NOT NULL,
ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "announcements_status_scheduledFor_idx" ON "announcements"("status", "scheduledFor");

-- DRAFT: nothing set · SCHEDULED: a pending instant · PUBLISHED: the actual
-- instant · ARCHIVED: published, then archived.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_lifecycle_check" CHECK (
  ("status" = 'DRAFT' AND "scheduledFor" IS NULL AND "publishedAt" IS NULL AND "archivedAt" IS NULL)
  OR ("status" = 'SCHEDULED' AND "scheduledFor" IS NOT NULL AND "publishedAt" IS NULL AND "archivedAt" IS NULL)
  OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL)
  OR ("status" = 'ARCHIVED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NOT NULL)
);

-- Once published: never back to draft/scheduled, audience and publication instant fixed
-- (the notifications were computed from them).
CREATE FUNCTION announcements_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND (NEW."status" IN ('DRAFT', 'SCHEDULED')
      OR NEW."audience" <> OLD."audience"
      OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt") THEN
    RAISE EXCEPTION 'announcements_published_locked: audience and publication of a published announcement cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'announcements_published_locked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER announcements_guard BEFORE UPDATE ON "announcements"
  FOR EACH ROW EXECUTE FUNCTION announcements_guard();

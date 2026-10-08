-- Part 10.8 — resources, announcements, in-app notifications.
-- The communication tables are empty before this migration (no API wrote to
-- them), so dropping announcements.isActive / notifications.isRead loses nothing:
-- they are replaced by an explicit status and by readAt.

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "AnnouncementAudience" ADD VALUE 'SPECIFIC_BRANCHES';

-- DropIndex
DROP INDEX "announcements_isActive_publishedAt_idx";

-- DropIndex
DROP INDEX "notifications_userId_isRead_createdAt_idx";

-- AlterTable
ALTER TABLE "announcements" DROP COLUMN "isActive",
ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "firstPublishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "isRead";

-- CreateTable
CREATE TABLE "announcement_branch_targets" (
    "announcementId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "announcement_branch_targets_pkey" PRIMARY KEY ("announcementId","branchId")
);

-- CreateIndex
CREATE INDEX "announcement_branch_targets_branchId_idx" ON "announcement_branch_targets"("branchId");

-- CreateIndex
CREATE INDEX "announcements_status_publishedAt_idx" ON "announcements"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "announcements_publishedByUserId_idx" ON "announcements"("publishedByUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_resourceId_key" ON "notifications"("userId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_announcementId_key" ON "notifications"("userId", "announcementId");

-- AddForeignKey
ALTER TABLE "announcement_branch_targets" ADD CONSTRAINT "announcement_branch_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_branch_targets" ADD CONSTRAINT "announcement_branch_targets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Resources: links carry a safe http(s) URL; file types need a stored file
-- reference (set by the server only — file storage arrives in Part 10.10).
-- ---------------------------------------------------------------------------
ALTER TABLE "resources" ADD CONSTRAINT "resources_content_check" CHECK (
  ("type" IN ('VIDEO_LINK', 'EXTERNAL_LINK')
     AND "externalUrl" ~* '^https?://' AND "fileUrl" IS NULL)
  OR ("type" IN ('PDF', 'IMAGE', 'AUDIO', 'FILE')
     AND "fileUrl" IS NOT NULL AND "externalUrl" IS NULL)
);
-- (resource_targets_one_target_check — exactly one of group / class — exists since the init migration)

-- ---------------------------------------------------------------------------
-- Announcements: explicit lifecycle; audience and visibility date are fixed
-- once published (notifications were computed from them).
-- ---------------------------------------------------------------------------
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_lifecycle_check" CHECK (
  ("status" = 'DRAFT' AND "firstPublishedAt" IS NULL AND "archivedAt" IS NULL)
  OR ("status" = 'PUBLISHED' AND "firstPublishedAt" IS NOT NULL AND "archivedAt" IS NULL)
  OR ("status" = 'ARCHIVED' AND "firstPublishedAt" IS NOT NULL AND "archivedAt" IS NOT NULL)
);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_dates_check"
  CHECK ("expiresAt" IS NULL OR "expiresAt" >= "publishedAt");

CREATE FUNCTION announcements_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND (NEW."status" = 'DRAFT'
      OR NEW."audience" <> OLD."audience" OR NEW."publishedAt" <> OLD."publishedAt"
      OR NEW."firstPublishedAt" IS DISTINCT FROM OLD."firstPublishedAt") THEN
    RAISE EXCEPTION 'announcements_published_locked: audience and publication of a published announcement cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'announcements_published_locked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER announcements_guard BEFORE UPDATE ON "announcements"
  FOR EACH ROW EXECUTE FUNCTION announcements_guard();

-- ---------------------------------------------------------------------------
-- Notifications: exactly one linked item, matching the type (replaces the
-- init migration's weaker "at most one" check).
-- ---------------------------------------------------------------------------
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_one_entity_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_entity_check" CHECK (
  ("type" = 'RESOURCE_PUBLISHED' AND "resourceId" IS NOT NULL AND "announcementId" IS NULL)
  OR ("type" = 'ANNOUNCEMENT_PUBLISHED' AND "announcementId" IS NOT NULL AND "resourceId" IS NULL)
);

-- Notifications: who did it, and what it is about, kept when that content is deleted.
-- Additive: one enum, three NULLABLE columns, one index, one trigger. Existing
-- rows are never deleted; the only write fills the two new columns
-- ("entityType", "entityId") from the link each row already has. Their type,
-- title, message, recipient, read state and date are not touched.

-- CreateEnum
CREATE TYPE "NotificationEntity" AS ENUM ('RESOURCE', 'ANNOUNCEMENT', 'SESSION');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "entityType" "NotificationEntity",
ADD COLUMN "entityId" UUID,
ADD COLUMN "actorUserId" UUID;

-- Backfill: what each existing notification is about (exactly one link per row, by the current check)
UPDATE "notifications"
SET "entityType" = CASE
      WHEN "resourceId" IS NOT NULL THEN 'RESOURCE'::"NotificationEntity"
      WHEN "announcementId" IS NOT NULL THEN 'ANNOUNCEMENT'::"NotificationEntity"
      ELSE 'SESSION'::"NotificationEntity"
    END,
    "entityId" = COALESCE("resourceId", "announcementId", "sessionId");

-- CreateIndex
CREATE INDEX "notifications_actorUserId_idx" ON "notifications"("actorUserId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- History: deleting a resource, announcement or session clears the link instead of deleting the notifications
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_resourceId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_announcementId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_sessionId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A notification written without "entityType" (by an API older than this
-- migration, between the migration and its deployment) gets it from its link
CREATE FUNCTION "notification_entity_from_link"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."entityType" IS NULL THEN
    IF NEW."resourceId" IS NOT NULL THEN
      NEW."entityType" := 'RESOURCE'; NEW."entityId" := NEW."resourceId";
    ELSIF NEW."announcementId" IS NOT NULL THEN
      NEW."entityType" := 'ANNOUNCEMENT'; NEW."entityId" := NEW."announcementId";
    ELSIF NEW."sessionId" IS NOT NULL THEN
      NEW."entityType" := 'SESSION'; NEW."entityId" := NEW."sessionId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "notifications_entity_from_link" BEFORE INSERT ON "notifications"
FOR EACH ROW EXECUTE FUNCTION "notification_entity_from_link"();

-- One subject per notification: a link (while its content exists) always
-- matches "entityType"/"entityId", and each type keeps its kind of subject
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_entity_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_entity_check" CHECK (
  num_nonnulls("resourceId", "announcementId", "sessionId") <= 1
  AND ("entityType" IS NULL) = ("entityId" IS NULL)
  AND ("resourceId" IS NULL OR ("entityType" = 'RESOURCE' AND "entityId" = "resourceId"))
  AND ("announcementId" IS NULL OR ("entityType" = 'ANNOUNCEMENT' AND "entityId" = "announcementId"))
  AND ("sessionId" IS NULL OR ("entityType" = 'SESSION' AND "entityId" = "sessionId"))
  AND ("type"::text <> 'RESOURCE_PUBLISHED' OR "entityType" = 'RESOURCE')
  AND ("type"::text <> 'ANNOUNCEMENT_PUBLISHED' OR "entityType" = 'ANNOUNCEMENT')
  AND ("type"::text <> 'ATTENDANCE_MODIFIED' OR "entityType" = 'SESSION')
);

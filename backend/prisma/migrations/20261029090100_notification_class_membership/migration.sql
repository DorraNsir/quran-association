-- Notifications to teachers about students joining / leaving their classes (2/2):
-- the subject rule extended to the three new types. Additive: no row is
-- inserted, updated or deleted (no existing notification has these types).
-- Their subject (a student, a class) has no link column: it stays named after
-- the student or class is gone, and the API reports it unavailable then.

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
  AND ("type"::text <> 'REGISTRATION_REQUEST_SUBMITTED' OR "entityType" = 'REGISTRATION_REQUEST')
  AND ("type"::text <> 'ONBOARDING_SUBMITTED' OR "entityType" = 'ONBOARDING_SUBMISSION')
  AND ("type"::text <> 'STUDENT_JOINED_CLASS' OR "entityType" = 'STUDENT')
  AND ("type"::text <> 'STUDENT_TRANSFERRED' OR "entityType" = 'STUDENT')
  AND ("type"::text <> 'STUDENT_LEFT_CLASS' OR "entityType" = 'GROUP_CLASS')
);

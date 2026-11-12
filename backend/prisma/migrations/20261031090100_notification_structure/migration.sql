-- Notifications about groups, classes and upcoming lessons (2/2): the subject
-- rule extended to the three new types. Additive: no row is inserted, updated
-- or deleted (no existing notification has these types). A lesson's
-- notification keeps its subject when the lesson is deleted (its link column
-- is cleared, as for attendance changes).

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
  AND ("type"::text <> 'GROUP_CHANGED' OR "entityType" = 'GROUP')
  AND ("type"::text <> 'CLASS_CHANGED' OR "entityType" = 'GROUP_CLASS')
  AND ("type"::text <> 'SESSION_CHANGED' OR "entityType" = 'SESSION')
);

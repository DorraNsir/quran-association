-- Notifications to the admins about new requests (2/2). Additive: one partial
-- unique index and the subject rule extended to the two new types. No row is
-- inserted, updated or deleted (no existing notification has these types).

-- A request reaches each admin once
CREATE UNIQUE INDEX "notifications_one_per_request_key" ON "notifications"("userId", "type", "entityId") WHERE ("entityType" IN ('REGISTRATION_REQUEST', 'ONBOARDING_SUBMISSION'));

-- Each type keeps its kind of subject (same rule as before, plus the two new types,
-- whose subject has no link column: it stays named after the request is gone)
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
);

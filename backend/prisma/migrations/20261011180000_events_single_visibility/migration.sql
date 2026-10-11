-- Events: one visibility switch. «جعلها داخلية» (isPublic = false) did exactly
-- what «إلغاء النشر» (isPublished = false) does — hide the event from the site —
-- so only isPublished remains. An event that is hidden today only because it
-- was internal is unpublished, so nothing becomes visible by this change.
-- The isPublic column is kept (no data loss) but no longer used.
UPDATE "public_events" SET "isPublished" = false
WHERE NOT "isPublic" AND "isPublished";

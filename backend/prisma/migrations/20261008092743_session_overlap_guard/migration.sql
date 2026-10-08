-- Database backstop for session integrity (the service checks first and returns
-- 409 CLASS_SESSION_CONFLICT): within one class, two non-cancelled sessions
-- never overlap on the same day. Touching sessions ([17:00,19:00) then
-- [19:00,20:00)) are allowed. Cancelled sessions never block.
-- Room / teacher overlaps span several classes (room and team live on the
-- class) and are enforced by the service under a transaction-scoped advisory
-- lock (pg_advisory_xact_lock(hashtext('scheduling'))).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_class_no_overlap"
  EXCLUDE USING gist (
    "groupClassId" WITH =,
    tsrange("date" + "startTime", "date" + "endTime", '[)') WITH &&
  ) WHERE ("status" <> 'CANCELLED');

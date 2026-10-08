-- Integrity + backfill of student_enrollments (Prisma Migrate leaves extensions,
-- CHECK and EXCLUDE constraints untouched in later diffs).

-- Half-open periods: endDate (exclusive) is never before startDate
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_dates_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

-- A student's memberships never overlap in time (btree_gist provides "=" on uuid inside GiST)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_no_overlap"
  EXCLUDE USING gist ("studentId" WITH =, daterange("startDate", "endDate", '[)') WITH &&);

-- Backfill: every student currently in a class gets one open enrollment starting
-- at its registration date (best known start: no history existed before).
INSERT INTO "student_enrollments" ("id", "studentId", "groupClassId", "startDate", "endDate", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."id", s."groupClassId", s."registrationDate", NULL, now(), now()
FROM "students" s
WHERE s."groupClassId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "student_enrollments" e WHERE e."studentId" = s."id");

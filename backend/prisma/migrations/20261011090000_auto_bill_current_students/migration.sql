-- Automatic billing (data only, no schema change): students are now charged
-- their group's fee automatically when they join a group, are moved,
-- reactivated, or when the fee is set. This brings the existing data to the
-- same state: every ACTIVE student currently in a class of a group with an
-- ACTIVE fee for an academic year that is not over gets that fee's
-- obligation (fee total, frozen). Same rule as the application's
-- billStudents(): students already charged for the group/year are skipped,
-- and an obligation an admin voided for that fee is not recreated.
-- Nothing is updated or deleted; safe to run on any data.
INSERT INTO "payment_obligations"
  ("id", "studentId", "groupFeeId", "groupId", "academicYearId", "expectedAmount", "createdAt", "updatedAt")
SELECT gen_random_uuid(), x."studentId", x."feeId", x."groupId", x."academicYearId", x.total, now(), now()
FROM (
  SELECT DISTINCT s."id" AS "studentId", f."id" AS "feeId", f."groupId",
    f."academicYearId", f."amount" * f."numberOfPeriods" AS total
  FROM "students" s
  JOIN "student_enrollments" e ON e."studentId" = s."id" AND e."endDate" IS NULL
  JOIN "group_classes" gc ON gc."id" = e."groupClassId"
  JOIN "group_fees" f ON f."groupId" = gc."groupId" AND f."isActive"
  JOIN "academic_years" y ON y."id" = f."academicYearId"
  WHERE s."status" = 'ACTIVE'
    AND y."endDate" >= (now() AT TIME ZONE 'Africa/Tunis')::date
    AND e."startDate" <= y."endDate"
    AND NOT EXISTS (
      SELECT 1 FROM "payment_obligations" o
      WHERE o."studentId" = s."id"
        AND ((o."groupId" = f."groupId" AND o."academicYearId" = f."academicYearId" AND o."voidedAt" IS NULL)
          OR o."groupFeeId" = f."id")
    )
) x
ON CONFLICT DO NOTHING;

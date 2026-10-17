-- «حصة إضافية (مرة واحدة)» is stored on the session instead of being guessed
-- from a missing weekly slot: deleting a slot also clears that link on its
-- sessions, which must not turn them into extra sessions.
-- Additive: one column with a default; existing sessions are not extra.
ALTER TABLE "sessions" ADD COLUMN "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- Clean-up of slots deleted before «حذف الموعد الأسبوعي» cancelled their
-- upcoming lessons: the SAME rule it applies today — sessions left without a
-- weekly slot, still SCHEDULED, from today (Africa/Tunis) onward, with no
-- attendance recorded, are cancelled (kept, reversible). Past sessions and
-- sessions with attendance stay as history.
UPDATE "sessions" s
SET "status" = 'CANCELLED',
    "cancellationReason" = 'حُذف الموعد الأسبوعي من البرنامج',
    "updatedAt" = now()
WHERE s."weeklyScheduleId" IS NULL
  AND s."isExtra" = false
  AND s."status" = 'SCHEDULED'
  AND s."date" >= (now() AT TIME ZONE 'Africa/Tunis')::date
  AND NOT EXISTS (SELECT 1 FROM "student_attendance" a WHERE a."sessionId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "teacher_attendance" t WHERE t."sessionId" = s."id");

-- «تاريخ بداية الحصص»: the first date of a weekly slot's lessons.
-- Additive only: one NULLABLE column, no default, no backfill — existing slots
-- keep NULL (their previous behavior); no other table or row is changed.

-- AlterTable
ALTER TABLE "weekly_schedules" ADD COLUMN     "startDate" DATE;

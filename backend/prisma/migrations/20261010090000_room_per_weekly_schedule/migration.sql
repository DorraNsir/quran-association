-- Room per weekly slot: a class keeps its branch, each WeeklySchedule gets its own room.
-- Data-preserving: every existing slot inherits the room its class had until now.

-- 1. New column, filled from the class's current room
ALTER TABLE "weekly_schedules" ADD COLUMN "roomId" UUID;

UPDATE "weekly_schedules" ws
SET "roomId" = gc."roomId"
FROM "group_classes" gc
WHERE gc."id" = ws."groupClassId";

-- 2. Explicit guard: never continue with a slot that has no room
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "weekly_schedules" WHERE "roomId" IS NULL) THEN
    RAISE EXCEPTION 'room_per_weekly_schedule: % weekly slot(s) without a room',
      (SELECT count(*) FROM "weekly_schedules" WHERE "roomId" IS NULL);
  END IF;
END $$;

ALTER TABLE "weekly_schedules" ALTER COLUMN "roomId" SET NOT NULL;

ALTER TABLE "weekly_schedules"
  ADD CONSTRAINT "weekly_schedules_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "weekly_schedules_roomId_dayOfWeek_idx" ON "weekly_schedules"("roomId", "dayOfWeek");

-- 3. The class-level room is now redundant (its value lives in the slots above)
ALTER TABLE "group_classes" DROP CONSTRAINT "group_classes_roomId_branchId_fkey";
DROP INDEX "group_classes_roomId_idx";
ALTER TABLE "group_classes" DROP COLUMN "roomId";

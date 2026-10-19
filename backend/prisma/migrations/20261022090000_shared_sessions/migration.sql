-- «الحصص المشتركة» (shared teaching sessions).
-- Additive only: two new tables (+ indexes, foreign keys). No existing table,
-- column, constraint or row is changed; nothing is backfilled. An existing
-- weekly slot / session has no rows here, i.e. it stays a normal one-class
-- slot / session (its host class remains weekly_schedules / sessions."groupClassId").

-- CreateTable
CREATE TABLE "weekly_schedule_classes" (
    "weeklyScheduleId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,

    CONSTRAINT "weekly_schedule_classes_pkey" PRIMARY KEY ("weeklyScheduleId","groupClassId")
);

-- CreateTable
CREATE TABLE "session_classes" (
    "sessionId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,

    CONSTRAINT "session_classes_pkey" PRIMARY KEY ("sessionId","groupClassId")
);

-- CreateIndex
CREATE INDEX "weekly_schedule_classes_groupClassId_idx" ON "weekly_schedule_classes"("groupClassId");

-- CreateIndex
CREATE INDEX "session_classes_groupClassId_idx" ON "session_classes"("groupClassId");

-- AddForeignKey
ALTER TABLE "weekly_schedule_classes" ADD CONSTRAINT "weekly_schedule_classes_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedule_classes" ADD CONSTRAINT "weekly_schedule_classes_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_classes" ADD CONSTRAINT "session_classes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_classes" ADD CONSTRAINT "session_classes_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

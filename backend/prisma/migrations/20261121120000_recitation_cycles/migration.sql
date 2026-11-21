-- Work Program 2.0 — Phase 4: «متابعة العرضات» (recitation cycles).
-- ADDITIVE ONLY: one table, one nullable column (+ index, FK, CHECKs). Existing work items keep
-- recitationCycleId NULL: recitations planned before cycles existed are not linked, rewritten
-- or counted automatically (no evaluation is invented for them).

-- CreateTable
CREATE TABLE "recitation_cycles" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "surah" SMALLINT NOT NULL,
    "number" INTEGER NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "startedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recitation_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recitation_cycles_surah_check" CHECK ("surah" BETWEEN 1 AND 114),
    CONSTRAINT "recitation_cycles_number_check" CHECK ("number" >= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "recitation_cycles_studentId_surah_number_key" ON "recitation_cycles"("studentId", "surah", "number");

-- AddForeignKey
ALTER TABLE "recitation_cycles" ADD CONSTRAINT "recitation_cycles_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recitation_cycles" ADD CONSTRAINT "recitation_cycles_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN "recitationCycleId" UUID;

-- CreateIndex
CREATE INDEX "work_items_recitationCycleId_idx" ON "work_items"("recitationCycleId");

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_recitationCycleId_fkey" FOREIGN KEY ("recitationCycleId") REFERENCES "recitation_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only a structured عرضة (one whole surah) is an attempt of a cycle (the API also checks that
-- the cycle belongs to the item's student and surah)
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_recitation_cycle_check" CHECK (
    "recitationCycleId" IS NULL
    OR ("type" = 'RECITATION' AND "quranAssignmentKind" = 'SURAH_RANGE' AND "recitationNumber" IS NOT NULL)
);

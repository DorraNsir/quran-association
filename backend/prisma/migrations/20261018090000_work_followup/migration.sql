-- «متابعة العمل»: work programs (one per student per dated session) and
-- their work items. Additive only: two enums, two new tables, no change to
-- existing tables or data. History is protected: nothing cascades from a
-- session, a student or another item (RESTRICT); users only SET NULL.

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('NOT_EVALUATED', 'COMPLETED', 'NOT_COMPLETED', 'PARTIAL', 'POSTPONED', 'CANCELLED');

-- CreateTable
CREATE TABLE "work_programs" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "generalNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "workProgramId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "WorkType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'NOT_EVALUATED',
    "recitationNumber" INTEGER,
    "evaluationComment" TEXT,
    "carriedFromItemId" UUID,
    "carriedFromStatus" "WorkStatus",
    "continuedFromItemId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "evaluatedByUserId" UUID,
    "evaluatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one program per student per session
CREATE UNIQUE INDEX "work_programs_studentId_sessionId_key" ON "work_programs"("studentId", "sessionId");

-- CreateIndex
CREATE INDEX "work_programs_sessionId_idx" ON "work_programs"("sessionId");

-- CreateIndex: an item is carried at most once into a given program (student + session)
CREATE UNIQUE INDEX "work_items_carriedFromItemId_workProgramId_key" ON "work_items"("carriedFromItemId", "workProgramId");

-- CreateIndex: the next recitation of an item is planned at most once into a given program
CREATE UNIQUE INDEX "work_items_continuedFromItemId_workProgramId_key" ON "work_items"("continuedFromItemId", "workProgramId");

-- CreateIndex
CREATE INDEX "work_items_workProgramId_position_idx" ON "work_items"("workProgramId", "position");

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workProgramId_fkey" FOREIGN KEY ("workProgramId") REFERENCES "work_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_carriedFromItemId_fkey" FOREIGN KEY ("carriedFromItemId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_continuedFromItemId_fkey" FOREIGN KEY ("continuedFromItemId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_evaluatedByUserId_fkey" FOREIGN KEY ("evaluatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity rules the API also enforces (a last line of defence)
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_version_check" CHECK ("version" >= 1);
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_values_check" CHECK (
    "version" >= 1
    AND "position" >= 0
    AND char_length(btrim("description")) > 0
    AND ("recitationNumber" IS NULL OR "recitationNumber" >= 1)
    -- the transfer-time status is kept exactly when the item was carried
    AND (("carriedFromItemId" IS NULL) = ("carriedFromStatus" IS NULL))
    -- an item either continues unfinished work or follows a recitation, never both
    AND NOT ("carriedFromItemId" IS NOT NULL AND "continuedFromItemId" IS NOT NULL)
    -- a next recitation is a numbered recitation
    AND ("continuedFromItemId" IS NULL OR ("type" = 'RECITATION' AND "recitationNumber" IS NOT NULL))
);

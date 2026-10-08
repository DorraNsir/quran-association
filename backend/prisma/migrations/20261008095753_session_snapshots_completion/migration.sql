-- CreateEnum
CREATE TYPE "TeachingRole" AS ENUM ('SUPERVISOR', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "CompletionSource" AS ENUM ('ATTENDANCE', 'ADMIN_OVERRIDE');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "completedAt" TIMESTAMPTZ(3),
ADD COLUMN     "completedByUserId" UUID,
ADD COLUMN     "completionSource" "CompletionSource",
ADD COLUMN     "roomId" UUID;

-- Backfill (best known data: the class's CURRENT room) then require it
UPDATE "sessions" s SET "roomId" = gc."roomId" FROM "group_classes" gc WHERE gc.id = s."groupClassId";
ALTER TABLE "sessions" ALTER COLUMN "roomId" SET NOT NULL;

-- Existing COMPLETED sessions predate completion tracking: recorded as an admin decision
UPDATE "sessions" SET "completedAt" = "updatedAt", "completionSource" = 'ADMIN_OVERRIDE' WHERE "status" = 'COMPLETED';

-- CreateTable
CREATE TABLE "session_teachers" (
    "sessionId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "role" "TeachingRole" NOT NULL,

    CONSTRAINT "session_teachers_pkey" PRIMARY KEY ("sessionId","teacherId")
);

-- CreateIndex
CREATE INDEX "session_teachers_teacherId_idx" ON "session_teachers"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "session_teachers_one_supervisor_key" ON "session_teachers"("sessionId") WHERE (role = 'SUPERVISOR');

-- CreateIndex
CREATE INDEX "sessions_roomId_date_idx" ON "sessions"("roomId", "date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_teachers" ADD CONSTRAINT "session_teachers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_teachers" ADD CONSTRAINT "session_teachers_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill the team snapshot from each class's CURRENT supervisor and assistants
INSERT INTO "session_teachers" ("sessionId", "teacherId", "role")
SELECT s.id, gc."supervisorId", 'SUPERVISOR' FROM "sessions" s JOIN "group_classes" gc ON gc.id = s."groupClassId";
INSERT INTO "session_teachers" ("sessionId", "teacherId", "role")
SELECT s.id, a."teacherId", 'ASSISTANT' FROM "sessions" s JOIN "group_class_assistants" a ON a."groupClassId" = s."groupClassId"
ON CONFLICT DO NOTHING;

-- Completion metadata is present exactly when the session is COMPLETED
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_completion_check"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL AND "completionSource" IS NOT NULL));

-- Attendance: teacher attendance recording (who recorded it), an append-only
-- audit trail of student/teacher attendance changes, and an in-app
-- notification type linked to a session (assistant changes → supervisor).
-- Additive only: no existing row is modified or removed.

-- CreateEnum
CREATE TYPE "AttendanceSubject" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "AttendanceChangeKind" AS ENUM ('CREATED', 'MODIFIED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_MODIFIED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "sessionId" UUID;

-- AlterTable
ALTER TABLE "teacher_attendance" ADD COLUMN     "recordedByUserId" UUID;

-- CreateTable
CREATE TABLE "attendance_changes" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "subject" "AttendanceSubject" NOT NULL,
    "studentId" UUID,
    "teacherId" UUID,
    "kind" "AttendanceChangeKind" NOT NULL,
    "previousStatus" "AttendanceStatus",
    "newStatus" "AttendanceStatus" NOT NULL,
    "previousNote" TEXT,
    "newNote" TEXT,
    "actorUserId" UUID,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_changes_sessionId_createdAt_idx" ON "attendance_changes"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_sessionId_idx" ON "notifications"("sessionId");

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An attendance notification points to its session (and nothing else);
-- the existing two kinds keep their rule. Compared as text: the enum value
-- added above cannot be used as an enum literal in the same transaction.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_entity_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_entity_check" CHECK (
  ("type"::text = 'RESOURCE_PUBLISHED' AND "resourceId" IS NOT NULL AND "announcementId" IS NULL AND "sessionId" IS NULL)
  OR ("type"::text = 'ANNOUNCEMENT_PUBLISHED' AND "announcementId" IS NOT NULL AND "resourceId" IS NULL AND "sessionId" IS NULL)
  OR ("type"::text = 'ATTENDANCE_MODIFIED' AND "sessionId" IS NOT NULL AND "resourceId" IS NULL AND "announcementId" IS NULL)
);

-- Audit rows are about exactly one subject, and a first recording has no previous value
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_subject_check" CHECK (
  ("subject" = 'STUDENT' AND "studentId" IS NOT NULL AND "teacherId" IS NULL)
  OR ("subject" = 'TEACHER' AND "teacherId" IS NOT NULL AND "studentId" IS NULL)
);
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_kind_check" CHECK (
  ("kind" = 'CREATED' AND "previousStatus" IS NULL)
  OR ("kind" = 'MODIFIED' AND "previousStatus" IS NOT NULL)
);

-- Append-only: an audit entry is never rewritten
CREATE FUNCTION attendance_changes_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'attendance_changes_immutable: audit entries cannot be modified';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_changes_no_update
  BEFORE UPDATE ON "attendance_changes"
  FOR EACH ROW EXECUTE FUNCTION attendance_changes_immutable();

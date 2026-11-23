-- «الملاحظات والاقتراحات» (Feedback & Suggestions): teachers and students send feedback about the
-- application; the admins review it, change its status and answer it.
-- ADDITIVE ONLY: three new enums, one new table, new values on three existing enums
-- (NotificationType, NotificationEntity, FilePurpose). No existing row or column is changed.

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'IMPROVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'FEEDBACK_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'FEEDBACK_UPDATED';

-- AlterEnum
ALTER TYPE "NotificationEntity" ADD VALUE 'FEEDBACK';

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'FEEDBACK_SCREENSHOT';

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "senderRole" "Role" NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "screenshotFileId" UUID,
    "platform" "FeedbackPlatform",
    "appVersion" TEXT,
    "screenPath" TEXT,
    "adminResponse" TEXT,
    "respondedByUserId" UUID,
    "respondedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_createdByUserId_createdAt_idx" ON "feedback"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_status_createdAt_idx" ON "feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_category_createdAt_idx" ON "feedback"("category", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt");

-- CreateIndex
CREATE INDEX "feedback_screenshotFileId_idx" ON "feedback"("screenshotFileId");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_screenshotFileId_fkey" FOREIGN KEY ("screenshotFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Sent from a teacher's or a student's workspace only; bounded texts (the API validates the same)
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_sender_role_check" CHECK ("senderRole" IN ('TEACHER', 'STUDENT'));
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_lengths_check" CHECK (
    char_length("title") BETWEEN 1 AND 120
    AND char_length("description") BETWEEN 1 AND 3000
    AND ("adminResponse" IS NULL OR char_length("adminResponse") BETWEEN 1 AND 3000)
    AND ("appVersion" IS NULL OR char_length("appVersion") <= 40)
    AND ("screenPath" IS NULL OR char_length("screenPath") <= 200)
);
-- A response always comes with its time (its author may later be removed: SET NULL)
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_response_check" CHECK (
    ("adminResponse" IS NULL) = ("respondedAt" IS NULL)
);

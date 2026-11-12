-- Notifications to teachers about students joining / leaving their classes (1/2):
-- the new enum values only. Additive. Kept apart from their use (next
-- migration): PostgreSQL cannot use an enum value in the transaction adding it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_JOINED_CLASS';
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_TRANSFERRED';
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_LEFT_CLASS';

-- AlterEnum
ALTER TYPE "NotificationEntity" ADD VALUE 'STUDENT';
ALTER TYPE "NotificationEntity" ADD VALUE 'GROUP_CLASS';

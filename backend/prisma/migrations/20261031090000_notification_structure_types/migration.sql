-- Notifications about groups, classes (team, branch, status, weekly slots) and
-- upcoming lessons (1/2): the new enum values only. Additive. Kept apart from
-- their use (next migration): PostgreSQL cannot use an enum value in the
-- transaction adding it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'CLASS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'SESSION_CHANGED';

-- AlterEnum
ALTER TYPE "NotificationEntity" ADD VALUE 'GROUP';

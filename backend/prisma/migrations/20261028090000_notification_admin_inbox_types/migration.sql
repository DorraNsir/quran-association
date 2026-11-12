-- Notifications to the admins about new requests (1/2): the new enum values only.
-- Additive. Kept apart from their use (next migration): PostgreSQL cannot use
-- an enum value in the same transaction that adds it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_SUBMITTED';

-- AlterEnum
ALTER TYPE "NotificationEntity" ADD VALUE 'REGISTRATION_REQUEST';
ALTER TYPE "NotificationEntity" ADD VALUE 'ONBOARDING_SUBMISSION';

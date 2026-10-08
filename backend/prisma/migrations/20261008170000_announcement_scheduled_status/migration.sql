-- Part 10.8 (scheduling): new lifecycle value, in its own migration because PostgreSQL
-- cannot use an enum value added in the same transaction (the next migration does).
-- AlterEnum
ALTER TYPE "AnnouncementStatus" ADD VALUE 'SCHEDULED';

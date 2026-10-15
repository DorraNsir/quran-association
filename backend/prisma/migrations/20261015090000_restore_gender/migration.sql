-- Gender is collected again (students, teachers, accounts, registration requests).
-- Re-adds what 20261011210000_drop_gender removed, as before: an optional
-- column. Additive only — values dropped earlier cannot be recovered, so
-- existing people start without a gender until it is entered again.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "registration_requests" ADD COLUMN     "gender" "Gender";


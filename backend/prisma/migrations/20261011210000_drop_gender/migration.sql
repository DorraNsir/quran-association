-- Gender is no longer collected or used anywhere (students, teachers, accounts,
-- registration requests). Requested removal: the columns and the enum are
-- dropped — the stored values are permanently deleted (decided by the admin).

-- AlterTable
ALTER TABLE "persons" DROP COLUMN "gender";

-- AlterTable
ALTER TABLE "registration_requests" DROP COLUMN "gender";

-- DropEnum
DROP TYPE "Gender";


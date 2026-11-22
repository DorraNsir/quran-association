-- Work Program 2.0 — Phase 6: «التقييم العام» (overall evaluation of a student's work program).
-- ADDITIVE ONLY: one enum and three nullable columns on work_programs (+ FK, CHECK). Every
-- existing program stays valid and simply has no overall evaluation yet (all three NULL).

-- CreateEnum
CREATE TYPE "WorkPerformance" AS ENUM ('EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT');

-- AlterTable
ALTER TABLE "work_programs"
    ADD COLUMN "overallEvaluation" "WorkPerformance",
    ADD COLUMN "overallEvaluatedAt" TIMESTAMPTZ(3),
    ADD COLUMN "overallEvaluatedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_overallEvaluatedByUserId_fkey" FOREIGN KEY ("overallEvaluatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A level always comes with its time (the evaluator may later be removed: SET NULL)
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_overall_evaluation_check" CHECK (
    ("overallEvaluation" IS NULL) = ("overallEvaluatedAt" IS NULL)
    AND ("overallEvaluation" IS NOT NULL OR "overallEvaluatedByUserId" IS NULL)
);

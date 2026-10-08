-- CreateTable
CREATE TABLE "student_status_changes" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_status_changes_studentId_effectiveDate_key" ON "student_status_changes"("studentId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "student_status_changes" ADD CONSTRAINT "student_status_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_changes" ADD CONSTRAINT "student_status_changes_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (no status history existed before):
--  - every student was ACTIVE from its registration date (that is how students are created);
--  - a student whose CURRENT status is not ACTIVE gets that status from the migration date,
--    because the real date of the change is unknown (never back-dated by guess).
INSERT INTO "student_status_changes" ("id", "studentId", "status", "effectiveDate", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."id", 'ACTIVE', s."registrationDate", now(), now() FROM "students" s;

INSERT INTO "student_status_changes" ("id", "studentId", "status", "effectiveDate", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."id", s."status", GREATEST(CURRENT_DATE, s."registrationDate"), now(), now()
FROM "students" s
WHERE s."status" <> 'ACTIVE'
ON CONFLICT ("studentId", "effectiveDate") DO UPDATE SET "status" = EXCLUDED."status";

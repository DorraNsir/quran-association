-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_enrollments_studentId_startDate_idx" ON "student_enrollments"("studentId", "startDate");

-- CreateIndex
CREATE INDEX "student_enrollments_groupClassId_startDate_idx" ON "student_enrollments"("groupClassId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_one_open_key" ON "student_enrollments"("studentId") WHERE ("endDate" IS NULL);

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

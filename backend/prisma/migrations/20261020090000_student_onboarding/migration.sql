-- TEMPORARY «استكمال بيانات الطلبة» (student-onboarding module).
-- Additive and isolated: two enums and two NEW tables. No existing table is
-- altered. Permanent records never depend on these tables — the only link,
-- onboarding_submissions.approvedStudentId, is optional and SET NULL.
-- (Generated with `prisma migrate diff` against an up-to-date database, then
-- completed with the CHECK constraints at the end.)

-- CreateEnum
CREATE TYPE "OnboardingSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnboardingSubmitter" AS ENUM ('STUDENT', 'GUARDIAN');

-- CreateTable
CREATE TABLE "onboarding_links" (
    "id" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenSealed" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_submissions" (
    "id" UUID NOT NULL,
    "onboardingLinkId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "status" "OnboardingSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedBy" "OnboardingSubmitter" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "guardianPhone" TEXT,
    "cin" TEXT,
    "originalData" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "approvedStudentId" UUID,
    "linkedExisting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_links_tokenHash_key" ON "onboarding_links"("tokenHash");

-- CreateIndex
CREATE INDEX "onboarding_links_groupClassId_revokedAt_idx" ON "onboarding_links"("groupClassId", "revokedAt");

-- CreateIndex
CREATE INDEX "onboarding_submissions_status_createdAt_idx" ON "onboarding_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "onboarding_submissions_groupClassId_idx" ON "onboarding_submissions"("groupClassId");

-- CreateIndex
CREATE INDEX "onboarding_submissions_onboardingLinkId_idx" ON "onboarding_submissions"("onboardingLinkId");

-- AddForeignKey
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_onboardingLinkId_fkey" FOREIGN KEY ("onboardingLinkId") REFERENCES "onboarding_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_approvedStudentId_fkey" FOREIGN KEY ("approvedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity rules the API also enforces
ALTER TABLE "onboarding_submissions" ADD CONSTRAINT "onboarding_submissions_review_check" CHECK (
    "version" >= 1
    -- a pending submission has not been reviewed and created / matched nothing
    AND ("status" <> 'PENDING' OR ("reviewedAt" IS NULL AND "approvedStudentId" IS NULL))
    -- a rejected submission never points to a student
    AND ("status" <> 'REJECTED' OR "approvedStudentId" IS NULL)
);
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_token_check" CHECK (
    char_length("tokenHash") = 64 AND char_length("tokenSealed") > 0
);

-- TEMPORARY «استكمال بيانات الطلبة»: the photo sent with a submission.
-- Additive only: one new table, no change to any existing table.

-- CreateTable
CREATE TABLE "onboarding_photos" (
    "submissionId" UUID NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_photos_pkey" PRIMARY KEY ("submissionId")
);

-- AddForeignKey
ALTER TABLE "onboarding_photos" ADD CONSTRAINT "onboarding_photos_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "onboarding_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Images only, size consistent with the bytes
ALTER TABLE "onboarding_photos" ADD CONSTRAINT "onboarding_photos_content_check"
  CHECK ("mimeType" LIKE 'image/%' AND "size" > 0 AND octet_length("data") = "size");

-- Part 10.10 — shared file storage. File BYTES live in the storage driver
-- (private filesystem); PostgreSQL keeps metadata (stored_files) and FK
-- references (ON DELETE RESTRICT: a referenced file cannot be deleted).
-- The replaced columns hold no data (association logo, resource file
-- columns and person photos were never writable before this part).

-- The 10.8 resource rule references the file columns replaced below
ALTER TABLE "resources" DROP CONSTRAINT "resources_content_check";

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('ASSOCIATION_LOGO', 'CMS_IMAGE', 'PROFILE_PHOTO', 'EDUCATIONAL_RESOURCE');

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "imageFileId" UUID;

-- AlterTable
ALTER TABLE "administration_members" ADD COLUMN     "photoFileId" UUID;

-- AlterTable
ALTER TABLE "association_settings" DROP COLUMN "logoUrl",
ADD COLUMN     "logoFileId" UUID;

-- AlterTable
ALTER TABLE "gallery_images" ADD COLUMN     "imageFileId" UUID,
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "hero_slides" ADD COLUMN     "imageFileId" UUID,
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN     "coverImageFileId" UUID;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "photoFileId" UUID;

-- AlterTable
ALTER TABLE "public_events" ADD COLUMN     "imageFileId" UUID;

-- AlterTable
ALTER TABLE "public_group_listings" ADD COLUMN     "imageFileId" UUID;

-- AlterTable
ALTER TABLE "public_programs" ADD COLUMN     "imageFileId" UUID;

-- AlterTable
ALTER TABLE "quran_graduates" ADD COLUMN     "photoFileId" UUID;

-- AlterTable
ALTER TABLE "resources" DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "fileUrl",
DROP COLUMN "mimeType",
ADD COLUMN     "fileId" UUID;

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "groupClassId" UUID,
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- CreateIndex
CREATE INDEX "stored_files_createdAt_idx" ON "stored_files"("createdAt");

-- CreateIndex
CREATE INDEX "stored_files_uploadedByUserId_idx" ON "stored_files"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "association_settings" ADD CONSTRAINT "association_settings_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_programs" ADD CONSTRAINT "public_programs_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_group_listings" ADD CONSTRAINT "public_group_listings_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_coverImageFileId_fkey" FOREIGN KEY ("coverImageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_members" ADD CONSTRAINT "administration_members_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Files: positive size, server-generated key shape, allowlisted types only
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_metadata_check" CHECK (
  "size" > 0
  AND "storageKey" ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$'
  AND "mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/mp4')
  AND "checksum" ~ '^[0-9a-f]{64}$'
);

-- Resources: links carry an http(s) URL; file types reference a stored file
ALTER TABLE "resources" ADD CONSTRAINT "resources_content_check" CHECK (
  ("type" IN ('VIDEO_LINK', 'EXTERNAL_LINK')
     AND "externalUrl" ~* '^https?://' AND "fileId" IS NULL)
  OR ("type" IN ('PDF', 'IMAGE', 'AUDIO', 'FILE')
     AND "fileId" IS NOT NULL AND "externalUrl" IS NULL)
);

-- A person's photo URL is the API path of the photo file (kept for existing readers)
ALTER TABLE "persons" ADD CONSTRAINT "persons_photo_check" CHECK (
  ("photoFileId" IS NULL AND "photoUrl" IS NULL)
  OR ("photoFileId" IS NOT NULL AND "photoUrl" = '/api/files/' || "photoFileId"::text)
);

-- CMS media: a bundled website asset OR an uploaded file — exactly one when required
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") = 1);
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") = 1);
ALTER TABLE "public_programs" ADD CONSTRAINT "public_programs_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") <= 1);
ALTER TABLE "public_group_listings" ADD CONSTRAINT "public_group_listings_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") <= 1);
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") <= 1);
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_image_check"
  CHECK (num_nonnulls("imageUrl", "imageFileId") <= 1);
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_cover_check"
  CHECK (num_nonnulls("coverImageUrl", "coverImageFileId") <= 1);
ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_photo_check"
  CHECK (num_nonnulls("photoUrl", "photoFileId") <= 1);
ALTER TABLE "administration_members" ADD CONSTRAINT "administration_members_photo_check"
  CHECK (num_nonnulls("photoUrl", "photoFileId") <= 1);

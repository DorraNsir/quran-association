-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE');

-- CreateEnum
CREATE TYPE "Semester" AS ENUM ('FIRST', 'SECOND');

-- CreateEnum
CREATE TYPE "RegistrationRequestSource" AS ENUM ('PUBLIC_WEBSITE', 'ADMIN');

-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'IMAGE', 'AUDIO', 'VIDEO_LINK', 'EXTERNAL_LINK', 'FILE');

-- CreateEnum
CREATE TYPE "ResourceVisibility" AS ENUM ('ALL_STUDENTS', 'GROUP', 'GROUP_CLASS');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('EVERYONE', 'TEACHERS', 'STUDENTS', 'SPECIFIC_GROUP_CLASSES');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RESOURCE_PUBLISHED', 'ANNOUNCEMENT_PUBLISHED');

-- CreateEnum
CREATE TYPE "PublicGroupStatus" AS ENUM ('COMING_SOON', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GalleryCategory" AS ENUM ('ACTIVITIES', 'CEREMONIES', 'SESSIONS', 'SUMMER', 'LIFE');

-- CreateEnum
CREATE TYPE "AchievementCategory" AS ENUM ('QURAN', 'COMPETITION', 'AWARD', 'COMMUNITY', 'ASSOCIATION', 'MILESTONE');

-- CreateEnum
CREATE TYPE "DateFormat" AS ENUM ('DD_MM_YYYY', 'YYYY_MM_DD');

-- CreateEnum
CREATE TYPE "CalendarView" AS ENUM ('WEEK', 'ROOMS');

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "status" "ActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATE NOT NULL,
    "qualification" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "groupClassId" UUID,
    "guardianPhone" TEXT,
    "cin" TEXT,
    "registrationDate" DATE NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "semester2StartDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "status" "ActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_classes" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_class_assistants" (
    "groupClassId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_class_assistants_pkey" PRIMARY KEY ("groupClassId","teacherId")
);

-- CreateTable
CREATE TABLE "weekly_schedules" (
    "id" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weekly_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "weeklyScheduleId" UUID,
    "date" DATE NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attendance" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_attendance" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teacher_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memorization_progress" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "semester" "Semester" NOT NULL,
    "lastMemorizedSurahNumber" SMALLINT NOT NULL,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memorization_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_notes" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teacher_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_requests" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE,
    "age" SMALLINT,
    "phone" TEXT NOT NULL,
    "hasStudiedQuranBefore" BOOLEAN NOT NULL DEFAULT false,
    "previousExperience" TEXT,
    "notes" TEXT,
    "source" "RegistrationRequestSource" NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedByUserId" UUID,
    "createdStudentId" UUID,
    "interestedGroupId" UUID,
    "interestedProgramLabel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_fees" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "academicYearId" UUID,
    "label" TEXT NOT NULL,
    "billingType" "BillingType" NOT NULL,
    "amount" DECIMAL(10,3) NOT NULL,
    "numberOfPeriods" SMALLINT NOT NULL DEFAULT 1,
    "startDate" DATE,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_obligations" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "groupFeeId" UUID NOT NULL,
    "academicYearId" UUID,
    "expectedAmount" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "obligationId" UUID NOT NULL,
    "amount" DECIMAL(10,3) NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "receiptIssued" BOOLEAN NOT NULL DEFAULT false,
    "periodNumber" SMALLINT,
    "note" TEXT,
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ResourceType" NOT NULL,
    "fileUrl" TEXT,
    "externalUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "visibility" "ResourceVisibility" NOT NULL,
    "publishedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_targets" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "groupId" UUID,
    "groupClassId" UUID,

    CONSTRAINT "resource_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "publishedAt" DATE NOT NULL,
    "expiresAt" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_targets" (
    "announcementId" UUID NOT NULL,
    "groupClassId" UUID NOT NULL,

    CONSTRAINT "announcement_targets_pkey" PRIMARY KEY ("announcementId","groupClassId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resourceId" UUID,
    "announcementId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "association_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "association_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Tunis',
    "dateFormat" "DateFormat" NOT NULL DEFAULT 'DD_MM_YYYY',
    "defaultCalendarView" "CalendarView" NOT NULL DEFAULT 'WEEK',
    "defaultPageSize" SMALLINT NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "shortDescription" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "history" TEXT,
    "mission" TEXT NOT NULL,
    "vision" TEXT NOT NULL,
    "values" TEXT,
    "openingHours" TEXT,
    "mapUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "youtubeUrl" TEXT,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_slides" (
    "id" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_offerings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_programs" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "icon" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_group_listings" (
    "id" UUID NOT NULL,
    "groupId" UUID,
    "branchId" UUID,
    "title" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "schedule" TEXT,
    "imageUrl" TEXT,
    "publicStatus" "PublicGroupStatus" NOT NULL DEFAULT 'COMING_SOON',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_group_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "time" TIME(0),
    "location" TEXT,
    "imageUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_articles" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "publishedAt" DATE NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_images" (
    "id" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "category" "GalleryCategory",
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quran_graduates" (
    "id" UUID NOT NULL,
    "studentId" UUID,
    "fullName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "completionYear" SMALLINT,
    "completionDate" DATE,
    "shortMessage" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quran_graduates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administration_members" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "photoUrl" TEXT,
    "shortBio" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "administration_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE,
    "year" SMALLINT,
    "imageUrl" TEXT,
    "category" "AchievementCategory",
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "persons_lastName_firstName_idx" ON "persons"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "persons_phone_idx" ON "persons"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_roles_role_idx" ON "user_roles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_personId_key" ON "teachers"("personId");

-- CreateIndex
CREATE INDEX "teachers_status_idx" ON "teachers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "students_personId_key" ON "students"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "students_cin_key" ON "students"("cin");

-- CreateIndex
CREATE INDEX "students_groupClassId_idx" ON "students"("groupClassId");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_label_key" ON "academic_years"("label");

-- CreateIndex
CREATE INDEX "academic_years_startDate_idx" ON "academic_years"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_single_current_key" ON "academic_years"("isCurrent") WHERE ("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branchId_name_key" ON "rooms"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE INDEX "groups_status_idx" ON "groups"("status");

-- CreateIndex
CREATE INDEX "group_classes_groupId_idx" ON "group_classes"("groupId");

-- CreateIndex
CREATE INDEX "group_classes_branchId_idx" ON "group_classes"("branchId");

-- CreateIndex
CREATE INDEX "group_classes_roomId_idx" ON "group_classes"("roomId");

-- CreateIndex
CREATE INDEX "group_classes_supervisorId_idx" ON "group_classes"("supervisorId");

-- CreateIndex
CREATE INDEX "group_classes_status_idx" ON "group_classes"("status");

-- CreateIndex
CREATE INDEX "group_class_assistants_teacherId_idx" ON "group_class_assistants"("teacherId");

-- CreateIndex
CREATE INDEX "weekly_schedules_groupClassId_idx" ON "weekly_schedules"("groupClassId");

-- CreateIndex
CREATE INDEX "weekly_schedules_dayOfWeek_startTime_idx" ON "weekly_schedules"("dayOfWeek", "startTime");

-- CreateIndex
CREATE INDEX "sessions_groupClassId_date_idx" ON "sessions"("groupClassId", "date");

-- CreateIndex
CREATE INDEX "sessions_date_status_idx" ON "sessions"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_weeklyScheduleId_date_key" ON "sessions"("weeklyScheduleId", "date");

-- CreateIndex
CREATE INDEX "student_attendance_studentId_status_idx" ON "student_attendance"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_sessionId_studentId_key" ON "student_attendance"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "teacher_attendance_teacherId_idx" ON "teacher_attendance"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_attendance_sessionId_teacherId_key" ON "teacher_attendance"("sessionId", "teacherId");

-- CreateIndex
CREATE INDEX "memorization_progress_academicYearId_semester_idx" ON "memorization_progress"("academicYearId", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "memorization_progress_studentId_academicYearId_semester_key" ON "memorization_progress"("studentId", "academicYearId", "semester");

-- CreateIndex
CREATE INDEX "teacher_notes_studentId_date_idx" ON "teacher_notes"("studentId", "date");

-- CreateIndex
CREATE INDEX "teacher_notes_teacherId_idx" ON "teacher_notes"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "registration_requests_createdStudentId_key" ON "registration_requests"("createdStudentId");

-- CreateIndex
CREATE INDEX "registration_requests_status_submittedAt_idx" ON "registration_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "registration_requests_phone_idx" ON "registration_requests"("phone");

-- CreateIndex
CREATE INDEX "group_fees_groupId_academicYearId_isActive_idx" ON "group_fees"("groupId", "academicYearId", "isActive");

-- CreateIndex
CREATE INDEX "payment_obligations_studentId_academicYearId_idx" ON "payment_obligations"("studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_obligations_studentId_groupFeeId_key" ON "payment_obligations"("studentId", "groupFeeId");

-- CreateIndex
CREATE INDEX "payments_obligationId_idx" ON "payments"("obligationId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "resources_publishedByUserId_idx" ON "resources"("publishedByUserId");

-- CreateIndex
CREATE INDEX "resources_visibility_idx" ON "resources"("visibility");

-- CreateIndex
CREATE INDEX "resource_targets_groupId_idx" ON "resource_targets"("groupId");

-- CreateIndex
CREATE INDEX "resource_targets_groupClassId_idx" ON "resource_targets"("groupClassId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_targets_resourceId_groupId_key" ON "resource_targets"("resourceId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_targets_resourceId_groupClassId_key" ON "resource_targets"("resourceId", "groupClassId");

-- CreateIndex
CREATE INDEX "announcements_isActive_publishedAt_idx" ON "announcements"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "announcement_targets_groupClassId_idx" ON "announcement_targets"("groupClassId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "hero_slides_isActive_displayOrder_idx" ON "hero_slides"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "service_offerings_isPublished_displayOrder_idx" ON "service_offerings"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "public_programs_isPublished_displayOrder_idx" ON "public_programs"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "public_group_listings_isPublished_displayOrder_idx" ON "public_group_listings"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "public_events_isPublished_isPublic_startDate_idx" ON "public_events"("isPublished", "isPublic", "startDate");

-- CreateIndex
CREATE INDEX "news_articles_isPublished_publishedAt_idx" ON "news_articles"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "gallery_images_isPublished_displayOrder_idx" ON "gallery_images"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "quran_graduates_isPublished_displayOrder_idx" ON "quran_graduates"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "administration_members_isPublished_displayOrder_idx" ON "administration_members"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "achievements_isPublished_isFeatured_displayOrder_idx" ON "achievements"("isPublished", "isFeatured", "displayOrder");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_class_assistants" ADD CONSTRAINT "group_class_assistants_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_class_assistants" ADD CONSTRAINT "group_class_assistants_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "weekly_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memorization_progress" ADD CONSTRAINT "memorization_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memorization_progress" ADD CONSTRAINT "memorization_progress_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memorization_progress" ADD CONSTRAINT "memorization_progress_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_createdStudentId_fkey" FOREIGN KEY ("createdStudentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_interestedGroupId_fkey" FOREIGN KEY ("interestedGroupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_groupFeeId_fkey" FOREIGN KEY ("groupFeeId") REFERENCES "group_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "payment_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_targets" ADD CONSTRAINT "resource_targets_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_targets" ADD CONSTRAINT "resource_targets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_targets" ADD CONSTRAINT "resource_targets_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_groupClassId_fkey" FOREIGN KEY ("groupClassId") REFERENCES "group_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_group_listings" ADD CONSTRAINT "public_group_listings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_group_listings" ADD CONSTRAINT "public_group_listings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quran_graduates" ADD CONSTRAINT "quran_graduates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administration_members" ADD CONSTRAINT "administration_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Domain CHECK constraints (not expressible in the Prisma schema; Prisma Migrate
-- leaves CHECK constraints untouched in later diffs).
-- ─────────────────────────────────────────────────────────────────────────────

-- Academic year: valid range; the second semester starts inside the year
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_check"
  CHECK ("endDate" > "startDate" AND "semester2StartDate" > "startDate" AND "semester2StartDate" <= "endDate");

-- Time ranges
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_time_range_check" CHECK ("endTime" > "startTime");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_time_range_check" CHECK ("endTime" > "startTime");

-- Memorization: surah number in mushaf order
ALTER TABLE "memorization_progress" ADD CONSTRAINT "memorization_progress_surah_check"
  CHECK ("lastMemorizedSurahNumber" BETWEEN 1 AND 114);

-- Registration: plausible age when given instead of a birth date
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_age_check"
  CHECK ("age" IS NULL OR "age" BETWEEN 3 AND 99);

-- Money: strictly positive amounts, sane periods
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_amount_check" CHECK ("amount" > 0 AND "numberOfPeriods" >= 1);
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_dates_check" CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_amount_check" CHECK ("expectedAmount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0 AND ("periodNumber" IS NULL OR "periodNumber" >= 1));

-- Resource target: exactly one of group / group class
ALTER TABLE "resource_targets" ADD CONSTRAINT "resource_targets_one_target_check"
  CHECK (num_nonnulls("groupId", "groupClassId") = 1);

-- Notification: at most one referenced entity
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_one_entity_check"
  CHECK (num_nonnulls("resourceId", "announcementId") <= 1);

-- Public event: end not before start
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

-- Settings singletons (one row, id = 1) and supported values
ALTER TABLE "association_settings" ADD CONSTRAINT "association_settings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_page_size_check" CHECK ("defaultPageSize" IN (10, 20, 50));
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_singleton_check" CHECK ("id" = 1);

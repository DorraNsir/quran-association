import {
  buildNotifications,
  getAnnouncementRecipientUserIds,
  getResourceRecipientUserIds,
  type Directory,
} from "@/lib/communication"
import type { Announcement, AnnouncementTarget, Resource, ResourceTarget, UserNotification } from "@/types/domain"

import { branches, rooms } from "./branches"
import { groupClasses, groups } from "./groups"
import { schedules } from "./schedules"
import { students } from "./students"
import { teachers } from "./teachers"
import { users } from "./users"

/**
 * Seed resources and announcements. Files have metadata only: no stored
 * file exists in the mock phase (the API will return object-storage URLs).
 */
export const resources: Resource[] = [
  {
    id: "res1",
    title: "دليل آداب حلقة القرآن",
    description: "آداب التلاوة والحفظ داخل الحلقة وخارجها، للطلبة الجدد وأوليائهم.",
    type: "PDF",
    fileName: "adab-halaqa.pdf",
    mimeType: "application/pdf",
    fileSize: 842_000,
    publishedByUserId: "u1",
    visibilityType: "ALL_STUDENTS",
    createdAt: "2026-09-14",
    updatedAt: "2026-09-14",
  },
  {
    id: "res2",
    title: "المصحف الإلكتروني للمراجعة",
    description: "مصحف المدينة النبوية للمراجعة اليومية في البيت.",
    type: "EXTERNAL_LINK",
    externalUrl: "https://quran.ksu.edu.sa",
    publishedByUserId: "u1",
    visibilityType: "GROUP",
    createdAt: "2026-09-24",
    updatedAt: "2026-09-24",
  },
  {
    id: "res3",
    title: "تلاوة سورة الملك للمراجعة",
    description: "استمعوا إلى التلاوة مرتين قبل حصة الأحد مع متابعة المصحف.",
    type: "VIDEO_LINK",
    externalUrl: "https://www.youtube.com/watch?v=hb6zVKMW2nY",
    publishedByUserId: "u2",
    visibilityType: "GROUP_CLASS",
    createdAt: "2026-09-28",
    updatedAt: "2026-09-28",
  },
  {
    id: "res4",
    title: "تسجيل صوتي: سورة النبأ",
    description: "تسجيل بصوت المعلمة للمقطع المطلوب حفظه هذا الأسبوع.",
    type: "AUDIO",
    fileName: "naba.mp3",
    mimeType: "audio/mpeg",
    fileSize: 3_400_000,
    publishedByUserId: "u3",
    visibilityType: "GROUP_CLASS",
    createdAt: "2026-09-29",
    updatedAt: "2026-09-29",
  },
  {
    id: "res5",
    title: "أحكام النون الساكنة والتنوين",
    description: "ملخص الأحكام الأربعة مع أمثلة من جزء تبارك.",
    type: "PDF",
    fileName: "noun-sakina.pdf",
    mimeType: "application/pdf",
    fileSize: 1_250_000,
    publishedByUserId: "u1",
    visibilityType: "GROUP_CLASS",
    createdAt: "2026-09-30",
    updatedAt: "2026-09-30",
  },
]

export const resourceTargets: ResourceTarget[] = [
  { id: "rt1", resourceId: "res2", targetType: "GROUP", targetId: "g11" },
  { id: "rt2", resourceId: "res3", targetType: "GROUP_CLASS", targetId: "g11-a" },
  { id: "rt3", resourceId: "res4", targetType: "GROUP_CLASS", targetId: "g11-b" },
  { id: "rt4", resourceId: "res5", targetType: "GROUP_CLASS", targetId: "g1-a" },
]

export const announcements: Announcement[] = [
  {
    id: "ann1",
    title: "انطلاق السنة الدراسية 2026–2027",
    content: "نرحب بجميع الطلبة والمعلمين في السنة الدراسية الجديدة. تنطلق الحصص حسب البرنامج الأسبوعي لكل حلقة.",
    audienceType: "EVERYONE",
    publishedByUserId: "u1",
    publishedAt: "2026-09-12",
    isActive: true,
    createdAt: "2026-09-12",
    updatedAt: "2026-09-12",
  },
  {
    id: "ann2",
    title: "اجتماع المعلمين الشهري",
    content: "يُعقد اجتماع المعلمين يوم السبت 10 أكتوبر على الساعة 15:00 بالمقر الرئيسي لتنسيق برنامج السداسي.",
    audienceType: "TEACHERS",
    publishedByUserId: "u1",
    publishedAt: "2026-09-30",
    expiresAt: "2026-10-10",
    isActive: true,
    createdAt: "2026-09-30",
    updatedAt: "2026-09-30",
  },
  {
    id: "ann3",
    title: "تذكير: إحضار المصحف في كل حصة",
    content: "نذكّر الطلبة بضرورة إحضار المصحف الخاص بهم في كل حصة.",
    audienceType: "STUDENTS",
    publishedByUserId: "u1",
    publishedAt: "2026-10-01",
    isActive: true,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  },
  {
    id: "ann4",
    title: "حصة الأحد في القاعة 3",
    content: "تُقام حصة الأحد القادم كالعادة في القاعة 3 بالمقر الرئيسي، مع مراجعة جماعية لسورة الملك.",
    audienceType: "SPECIFIC_GROUP_CLASSES",
    publishedByUserId: "u1",
    publishedAt: "2026-10-01",
    isActive: true,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  },
  {
    id: "ann5",
    title: "عطلة نهاية السنة الماضية",
    content: "انتهت عطلة الصيف — إعلان منتهي الصلاحية يبقى في الأرشيف للإدارة.",
    audienceType: "EVERYONE",
    publishedByUserId: "u1",
    publishedAt: "2026-07-01",
    expiresAt: "2026-09-01",
    isActive: true,
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01",
  },
]

export const announcementTargets: AnnouncementTarget[] = [
  { id: "at1", announcementId: "ann4", groupClassId: "g11-a" },
]

/** Seed notifications, generated with the same recipient rules as live publishing. */
const directory: Directory = {
  users,
  students,
  lookups: { branches, rooms, groups, groupClasses, teachers, schedules },
}
let seq = 0
const nextId = () => `ntf${++seq}`

export const notifications: UserNotification[] = []
for (const r of resources) {
  notifications.push(
    ...buildNotifications({ type: "RESOURCE", id: r.id, title: r.title }, getResourceRecipientUserIds(r, resourceTargets, directory), notifications, r.createdAt, nextId)
  )
}
for (const a of announcements) {
  notifications.push(
    ...buildNotifications(
      { type: "ANNOUNCEMENT", id: a.id, title: a.title },
      // Recipients as of the publication day
      getAnnouncementRecipientUserIds(a, announcementTargets, directory, a.publishedAt),
      notifications,
      a.publishedAt,
      nextId
    )
  )
}
// Older alerts were already opened
for (const n of notifications) if (n.createdAt < "2026-09-27") n.isRead = true

import { describeClass, fullName, indexLookups, roomsLabel, type Lookups } from "@/lib/domain"
import { getTeacherClassIds, getTeacherGroupClasses } from "@/lib/teacher-access"
import type { Workspace } from "@/lib/workspace"
import type {
  Announcement,
  AnnouncementTarget,
  GroupClass,
  ID,
  ISODate,
  NotificationEntityType,
  NotificationType,
  Resource,
  ResourceTarget,
  Student,
  User,
  UserNotification,
} from "@/types/domain"

/**
 * THE targeting rules for resources, announcements and their notifications.
 * Lists, details pages, dashboards AND notification recipients all call
 * these functions, so "who can see it" and "who is notified" never differ.
 *
 * Group vs GroupClass: a GROUP target reaches every class of that group
 * (e.g. both classes of مجموعة ماهر); a GROUP_CLASS target reaches only
 * that class. A student's group is always resolved through their class.
 *
 * Mock phase: UX filters only — the API must apply the same rules.
 */

/** Everything recipient computation needs to know about people. */
export interface Directory {
  users: User[]
  students: Student[]
  lookups: Lookups
}

/* ---------------- GroupClass labels ---------------- */

/** "مجموعة ماهر — المقر الرئيسي — القاعة 3، القاعة 4 — حمدي بن عثمان": never two identical options. */
export function groupClassLabel(groupClass: GroupClass, lookups: Lookups) {
  const view = describeClass(groupClass, indexLookups(lookups))
  return [view.group?.name, view.branch?.name, view.rooms.length ? roomsLabel(view.rooms) : undefined, view.supervisor && fullName(view.supervisor)]
    .filter(Boolean)
    .join(" — ")
}

/* ---------------- Resources ---------------- */

export const resourceTargetsOf = (resourceId: ID, targets: ResourceTarget[]) =>
  targets.filter((t) => t.resourceId === resourceId)

/** Classes a teacher may publish to: only their own (supervised or assisted) classes. */
export function getTeacherPublishableGroupClasses(teacherId: ID, lookups: Lookups) {
  return getTeacherGroupClasses(teacherId, lookups).map((a) => a.groupClass)
}

/**
 * Can this student see this resource?
 * ALL_STUDENTS → any active student · GROUP → their class's group is targeted ·
 * GROUP_CLASS → their class is targeted.
 */
export function isResourceVisibleToStudent(
  resource: Resource,
  targets: ResourceTarget[],
  student: Pick<Student, "groupClassId" | "status">,
  groupClasses: GroupClass[]
) {
  if (student.status !== "ACTIVE") return false
  if (resource.visibilityType === "ALL_STUDENTS") return true
  const mine = resourceTargetsOf(resource.id, targets)
  if (resource.visibilityType === "GROUP") {
    const groupId = groupClasses.find((c) => c.id === student.groupClassId)?.groupId
    return groupId !== undefined && mine.some((t) => t.targetType === "GROUP" && t.targetId === groupId)
  }
  return mine.some((t) => t.targetType === "GROUP_CLASS" && t.targetId === student.groupClassId)
}

const newestFirst = <T extends { createdAt: ISODate }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt)

export function getResourcesForStudent(
  student: Pick<Student, "groupClassId" | "status">,
  resources: Resource[],
  targets: ResourceTarget[],
  groupClasses: GroupClass[]
) {
  return resources.filter((r) => isResourceVisibleToStudent(r, targets, student, groupClasses)).sort(newestFirst)
}

/** Does a resource reach at least one of the teacher's classes? (for consulting, not editing) */
function reachesTeacherClasses(resource: Resource, targets: ResourceTarget[], teacherId: ID, lookups: Lookups) {
  if (resource.visibilityType === "ALL_STUDENTS") return true
  const classIds = getTeacherClassIds(teacherId, lookups)
  const groupIds = new Set(lookups.groupClasses.filter((c) => classIds.has(c.id)).map((c) => c.groupId))
  return resourceTargetsOf(resource.id, targets).some((t) =>
    t.targetType === "GROUP" ? groupIds.has(t.targetId) : classIds.has(t.targetId)
  )
}

/** A teacher consults the resources they published and those reaching their classes. */
export function canTeacherViewResource(resource: Resource, targets: ResourceTarget[], user: User, lookups: Lookups) {
  if (resource.publishedByUserId === user.id) return true
  return user.teacherId !== undefined && reachesTeacherClasses(resource, targets, user.teacherId, lookups)
}

/** A teacher edits only what they published (and only toward their own classes). */
export function canTeacherManageResource(resource: Resource, user: User) {
  return resource.publishedByUserId === user.id && resource.visibilityType === "GROUP_CLASS"
}

/** The teacher's own published resources, newest first. */
export function getResourcesPublishedBy(userId: ID, resources: Resource[]) {
  return resources.filter((r) => r.publishedByUserId === userId).sort(newestFirst)
}

/** Student accounts that can see the resource — same rule as the student lists. */
export function getResourceRecipientUserIds(resource: Resource, targets: ResourceTarget[], directory: Directory) {
  const studentsById = new Map(directory.students.map((s) => [s.id, s]))
  const ids = new Set<ID>()
  for (const user of directory.users) {
    if (user.id === resource.publishedByUserId || !user.roles.includes("STUDENT") || !user.studentId) continue
    const student = studentsById.get(user.studentId)
    if (student && isResourceVisibleToStudent(resource, targets, student, directory.lookups.groupClasses)) ids.add(user.id)
  }
  return [...ids]
}

/* ---------------- Announcements ---------------- */

export const announcementTargetsOf = (announcementId: ID, targets: AnnouncementTarget[]) =>
  targets.filter((t) => t.announcementId === announcementId)

export type AnnouncementState = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE"

/** Admin-facing status; only ACTIVE announcements reach teachers and students. */
export function announcementState(announcement: Announcement, today: ISODate): AnnouncementState {
  if (!announcement.isActive) return "INACTIVE"
  if (announcement.publishedAt > today) return "SCHEDULED"
  if (announcement.expiresAt && announcement.expiresAt < today) return "EXPIRED"
  return "ACTIVE"
}

export function isAnnouncementVisibleToStudent(
  announcement: Announcement,
  targets: AnnouncementTarget[],
  student: Pick<Student, "groupClassId" | "status">,
  today: ISODate
) {
  if (student.status !== "ACTIVE" || announcementState(announcement, today) !== "ACTIVE") return false
  switch (announcement.audienceType) {
    case "EVERYONE":
    case "STUDENTS":
      return true
    case "SPECIFIC_GROUP_CLASSES":
      return announcementTargetsOf(announcement.id, targets).some((t) => t.groupClassId === student.groupClassId)
    default:
      return false
  }
}

export function isAnnouncementVisibleToTeacher(
  announcement: Announcement,
  targets: AnnouncementTarget[],
  teacherId: ID,
  lookups: Lookups,
  today: ISODate
) {
  if (announcementState(announcement, today) !== "ACTIVE") return false
  switch (announcement.audienceType) {
    case "EVERYONE":
    case "TEACHERS":
      return true
    case "SPECIFIC_GROUP_CLASSES": {
      const classIds = getTeacherClassIds(teacherId, lookups)
      return announcementTargetsOf(announcement.id, targets).some((t) => classIds.has(t.groupClassId))
    }
    default:
      return false
  }
}

const newestPublished = (a: Announcement, b: Announcement) =>
  b.publishedAt.localeCompare(a.publishedAt) || b.createdAt.localeCompare(a.createdAt)

export function getAnnouncementsForStudent(
  student: Pick<Student, "groupClassId" | "status">,
  announcements: Announcement[],
  targets: AnnouncementTarget[],
  today: ISODate
) {
  return announcements.filter((a) => isAnnouncementVisibleToStudent(a, targets, student, today)).sort(newestPublished)
}

export function getAnnouncementsForTeacher(
  teacherId: ID,
  announcements: Announcement[],
  targets: AnnouncementTarget[],
  lookups: Lookups,
  today: ISODate
) {
  return announcements.filter((a) => isAnnouncementVisibleToTeacher(a, targets, teacherId, lookups, today)).sort(newestPublished)
}

/**
 * Accounts reached by an announcement, deduplicated by user: a multi-role
 * account matching several rules is notified once. EVERYONE also reaches
 * admin accounts. The publisher is never notified of their own post.
 */
export function getAnnouncementRecipientUserIds(
  announcement: Announcement,
  targets: AnnouncementTarget[],
  directory: Directory,
  today: ISODate
) {
  const studentsById = new Map(directory.students.map((s) => [s.id, s]))
  const ids = new Set<ID>()
  for (const user of directory.users) {
    if (user.id === announcement.publishedByUserId) continue
    const student = user.roles.includes("STUDENT") && user.studentId ? studentsById.get(user.studentId) : undefined
    const asStudent = student !== undefined && isAnnouncementVisibleToStudent(announcement, targets, student, today)
    const asTeacher =
      user.roles.includes("TEACHER") &&
      user.teacherId !== undefined &&
      isAnnouncementVisibleToTeacher(announcement, targets, user.teacherId, directory.lookups, today)
    const asAdmin =
      user.roles.includes("ADMIN") && announcement.audienceType === "EVERYONE" && announcementState(announcement, today) === "ACTIVE"
    if (asStudent || asTeacher || asAdmin) ids.add(user.id)
  }
  return [...ids]
}

/* ---------------- Notifications ---------------- */

export function getNotificationsForUser(userId: ID, notifications: UserNotification[]) {
  return notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

export function getUnreadNotificationCount(userId: ID, notifications: UserNotification[]) {
  return notifications.filter((n) => n.userId === userId && !n.isRead).length
}

/**
 * New notifications for the given recipients — skipping anyone already
 * notified about this entity, so publishing then re-activating never
 * notifies twice.
 */
export function buildNotifications(
  entity: { type: NotificationEntityType; id: ID; title: string },
  recipientUserIds: ID[],
  existing: UserNotification[],
  createdAt: ISODate,
  newId: () => ID
): UserNotification[] {
  const already = new Set(existing.filter((n) => n.entityType === entity.type && n.entityId === entity.id).map((n) => n.userId))
  const type: NotificationType = entity.type === "RESOURCE" ? "RESOURCE_PUBLISHED" : "ANNOUNCEMENT_PUBLISHED"
  return [...new Set(recipientUserIds)]
    .filter((userId) => !already.has(userId))
    .map((userId) => ({
      id: newId(),
      userId,
      type,
      title: entity.type === "RESOURCE" ? "مورد جديد" : "إعلان جديد",
      message: entity.type === "RESOURCE" ? `تم نشر مورد جديد: ${entity.title}` : `تم نشر إعلان: ${entity.title}`,
      entityType: entity.type,
      entityId: entity.id,
      isRead: false,
      createdAt,
    }))
}

/** Where a notification opens, inside the workspace the user is currently in. */
export function notificationHref(notification: UserNotification, workspace: Workspace) {
  if (!notification.entityId) return undefined
  const section = notification.entityType === "RESOURCE" ? "resources" : "announcements"
  return `/${workspace}/${section}/${notification.entityId}`
}

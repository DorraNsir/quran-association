/**
 * Core domain types for the admin module.
 * These mirror the shapes the future NestJS API is expected to return,
 * so mock data and UI components can be swapped onto real data later.
 */

export type ID = string

/** ISO date string, e.g. "2026-09-15" */
export type ISODate = string

/** 24h time string, e.g. "17:30" */
export type TimeOfDay = string

export type Role = "ADMIN" | "TEACHER" | "STUDENT"

export type RecordStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED"

export type StudentStatus = RecordStatus
export type TeacherStatus = Extract<RecordStatus, "ACTIVE" | "INACTIVE">
export type GroupStatus = RecordStatus
export type BranchStatus = Extract<RecordStatus, "ACTIVE" | "INACTIVE">
export type RoomStatus = Extract<RecordStatus, "ACTIVE" | "INACTIVE">

export type Gender = "MALE" | "FEMALE"

/** Responsibility of a teacher inside one group */
export type TeachingRole = "SUPERVISOR" | "ASSISTANT"

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"

/** Rooms only need to be identifiable — no capacity or equipment by design. */
export interface Room {
  id: ID
  branchId: ID
  name: string
  status: RoomStatus
}

/** Rooms reference their branch (Room.branchId); a branch does not embed them. */
export interface Branch {
  id: ID
  name: string
  address: string
  phone?: string
  status: BranchStatus
}

/**
 * An authenticated person. One user can hold several roles
 * (e.g. ADMIN + TEACHER) — never model them as separate accounts.
 */
export interface User {
  id: ID
  firstName: string
  lastName: string
  email: string
  phone: string
  roles: Role[]
  photoUrl?: string
  /** Set when the user also has a teacher profile */
  teacherId?: ID
  /** Set when the account belongs to a student (links to the existing Student record) */
  studentId?: ID
}

export interface Teacher {
  id: ID
  /** Linked login account, when the teacher has one */
  userId?: ID
  firstName: string
  lastName: string
  gender: Gender
  phone: string
  email?: string
  photoUrl?: string
  status: TeacherStatus
  joinedAt: ISODate
  /** Short qualification line, e.g. a Quran ijaza */
  qualification?: string
}

/** A time window on a weekday — the part of a schedule that can overlap. */
export interface ScheduleSlot {
  day: Weekday
  start: TimeOfDay
  end: TimeOfDay
}

/**
 * One recurring weekly slot of a GroupClass (a class usually meets 2–3 times).
 * Branch, room and teachers are NOT stored here — they come from the class,
 * so there is a single source of truth.
 */
export interface WeeklySchedule extends ScheduleSlot {
  id: ID
  groupClassId: ID
}

/** CLASS: the same class already meets at an overlapping time */
export type ConflictType = "ROOM" | "TEACHER" | "CLASS"

/** Why a candidate session cannot be scheduled (frontend UX check only). */
export interface ScheduleConflict {
  type: ConflictType
  /** The existing session it collides with */
  schedule: WeeklySchedule
  /** For TEACHER conflicts: the teachers booked in both groups */
  teacherIds: ID[]
}
/**
 * The pedagogical group (e.g. "مجموعة ماهر"). It only carries what is
 * shared by all its classes — location, teachers and students belong to
 * each GroupClass, because they differ from one class to another.
 */
export interface Group {
  id: ID
  name: string
  /** Target audience, e.g. "أطفال 7–10 سنوات" */
  audience: string
  status: GroupStatus
  createdAt: ISODate
}

export type GroupClassStatus = RecordStatus

/**
 * One actual class of a Group ("حلقة" in the UI): its own branch, room,
 * supervisor (exactly one), assistants (zero or more), weekly schedule,
 * sessions and attendance. Students point to it (Student.groupClassId).
 *
 *   Group ─┬─ GroupClass A (branch 1, room 1, supervisor A) ─ students, schedule, sessions
 *          └─ GroupClass B (branch 2, room 2, supervisor B) ─ students, schedule, sessions
 */
export interface GroupClass {
  id: ID
  groupId: ID
  branchId: ID
  /** All of this class's sessions take place in this room */
  roomId: ID
  supervisorId: ID
  assistantIds: ID[]
  status: GroupClassStatus
}

export interface Student {
  id: ID
  firstName: string
  lastName: string
  gender: Gender
  dateOfBirth: ISODate
  phone?: string
  guardianPhone?: string
  /** Tunisian national ID — only for students who hold one */
  cin?: string
  address: string
  photoUrl?: string
  registrationDate: ISODate
  /** The student's single active class; the pedagogical group is derived from it */
  groupClassId: ID
  status: StudentStatus
}

export type ActivityKind =
  | "STUDENT_REGISTERED"
  | "STUDENT_TRANSFERRED"
  | "TEACHER_ASSIGNED"
  | "GROUP_CREATED"
  | "GROUP_STATUS_CHANGED"
  | "GROUP_SCHEDULE_CHANGED"
  | "STUDENT_ARCHIVED"

export interface ActivityEntry {
  id: ID
  kind: ActivityKind
  message: string
  actor: string
  at: string
}

// ── Sessions & attendance (Part 3) ───────────────────────────────

export type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED"

/**
 * One actual, dated lesson. Generated from a recurring WeeklySchedule;
 * cancelling it affects only this date, never the weekly schedule.
 */
export interface Session extends Omit<ScheduleSlot, "day"> {
  id: ID
  /** The class that meets — group, branch, room and teachers derive from it */
  groupClassId: ID
  /** The weekly slot this session comes from */
  scheduleId: ID
  date: ISODate
  status: SessionStatus
  cancellationReason?: string
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "LATE"

/** Attendance of one student in one session. */
export interface StudentAttendance {
  id: ID
  sessionId: ID
  studentId: ID
  status: AttendanceStatus
  note?: string
}

/** Attendance of one assigned teacher in one session (no HR system — just presence). */
export interface TeacherAttendance {
  id: ID
  sessionId: ID
  teacherId: ID
  status: AttendanceStatus
  note?: string
}

// ── Academic years & memorization (Part 4) ────────────────────────

/** Each academic year has exactly two semesters. */
export type Semester = "SEMESTER_1" | "SEMESTER_2"

export interface DateRange {
  startDate: ISODate
  endDate: ISODate
}

/** Lightweight school year — enough for memorization tracking and period filters. */
export interface AcademicYear extends DateRange {
  /** e.g. "2026-2027" */
  id: ID
  /** e.g. "2026–2027" */
  label: string
  isCurrent: boolean
  semesters: Record<Semester, DateRange>
}

/** Quran surah number, 1–114, in mushaf order (see lib/quran/surahs). */
export type SurahNumber = number

/**
 * The student's LAST MEMORIZED SURAH for one semester of one academic year.
 * Unique per (studentId, academicYearId, semester): a change updates this
 * record — it is a current value, not a history of events. Other semesters
 * and years are separate records and are never overwritten.
 * Names (student, group, teacher, branch) are resolved through ids.
 */
export interface MemorizationProgress {
  id: ID
  studentId: ID
  academicYearId: ID
  semester: Semester
  lastMemorizedSurah: SurahNumber
  updatedByTeacherId: ID
  updatedAt: ISODate
}

/**
 * A teacher's private, internal note about one student.
 * Never part of any student- or parent-facing view: a future Student
 * Workspace must not read this type. The class is derived from the
 * student and the author from the signed-in teacher — never chosen.
 */
export interface TeacherNote {
  id: ID
  studentId: ID
  teacherId: ID
  /** The student's class when the note was written */
  groupClassId: ID
  date: ISODate
  content: string
  createdAt: ISODate
  updatedAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Communication: three separate concepts — Resource (pedagogical     */
/* content), Announcement (administrative communication) and          */
/* UserNotification (a per-user alert pointing at one of them).       */
/* ------------------------------------------------------------------ */

export type ResourceType = "PDF" | "IMAGE" | "AUDIO" | "VIDEO_LINK" | "EXTERNAL_LINK" | "FILE"
export type ResourceVisibilityType = "ALL_STUDENTS" | "GROUP" | "GROUP_CLASS"

/**
 * A pedagogical resource published by an admin or a teacher (a User, since
 * one account may hold several roles). Files are referenced by URL — the
 * API will store them in object storage — never embedded as base64.
 */
export interface Resource {
  id: ID
  title: string
  description: string
  type: ResourceType
  /** Stored file URL (object storage later). Mock phase: a transient blob: URL or absent */
  fileUrl?: string
  externalUrl?: string
  fileName?: string
  mimeType?: string
  /** Bytes */
  fileSize?: number
  publishedByUserId: ID
  visibilityType: ResourceVisibilityType
  createdAt: ISODate
  updatedAt: ISODate
}

/** One audience of a resource: an explicit Group or GroupClass (never an ambiguous id). */
export interface ResourceTarget {
  id: ID
  resourceId: ID
  targetType: Exclude<ResourceVisibilityType, "ALL_STUDENTS">
  targetId: ID
}

export type AnnouncementAudienceType = "EVERYONE" | "TEACHERS" | "STUDENTS" | "SPECIFIC_GROUP_CLASSES"

export interface Announcement {
  id: ID
  title: string
  content: string
  audienceType: AnnouncementAudienceType
  publishedByUserId: ID
  publishedAt: ISODate
  expiresAt?: ISODate
  isActive: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

/** For SPECIFIC_GROUP_CLASSES announcements */
export interface AnnouncementTarget {
  id: ID
  announcementId: ID
  groupClassId: ID
}

export type NotificationType = "RESOURCE_PUBLISHED" | "ANNOUNCEMENT_PUBLISHED" // later: SESSION_CHANGED, SESSION_CANCELLED…
export type NotificationEntityType = "RESOURCE" | "ANNOUNCEMENT"

/** An in-app alert for ONE user (named to avoid the DOM's global `Notification`). */
export interface UserNotification {
  id: ID
  userId: ID
  type: NotificationType
  title: string
  message: string
  entityType?: NotificationEntityType
  entityId?: ID
  isRead: boolean
  createdAt: ISODate
}

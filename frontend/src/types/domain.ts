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
  /** Login name (real accounts) */
  username?: string
  /** The canonical Person of the account */
  personId?: ID
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
 * One actual class of a Group ("قسم" in the UI): its own branch, room,
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

export type AnnouncementAudienceType = "EVERYONE" | "TEACHERS" | "STUDENTS" | "SPECIFIC_GROUP_CLASSES" | "SPECIFIC_BRANCHES"

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

/* ------------------------------------------------------------------ */
/* Registration & payments. A RegistrationRequest is NOT a Student;    */
/* GroupFee (pricing rule) ≠ PaymentObligation (what one student owes) */
/* ≠ Payment (one cash transaction).                                   */
/* ------------------------------------------------------------------ */

export type RegistrationRequestSource = "PUBLIC_WEBSITE" | "ADMIN"
export type RegistrationRequestStatus = "PENDING" | "ACCEPTED" | "REFUSED"

/** One applicant, from the public form or entered by an admin — same entity either way. */
export interface RegistrationRequest {
  id: ID
  firstName: string
  lastName: string
  birthDate?: ISODate
  /** When the applicant gave an age instead of a birth date */
  age?: number
  phone: string
  hasStudiedQuranBefore: boolean
  previousExperience?: string
  notes?: string
  source: RegistrationRequestSource
  status: RegistrationRequestStatus
  submittedAt: ISODate
  reviewedAt?: ISODate
  reviewedByUserId?: ID
  /** Set once, on admission — prevents converting the same request twice */
  createdStudentId?: ID
  /** Interest expressed on the public site (an upcoming group) — never a class assignment */
  interestedGroupId?: ID
  interestedProgramLabel?: string
}

export type BillingType = "YEARLY" | "MONTHLY"

/** Pricing rule of a pedagogical GROUP (all its classes inherit it). */
export interface GroupFee {
  id: ID
  groupId: ID
  academicYearId?: ID
  label: string
  billingType: BillingType
  /** Per period: the yearly amount, or the monthly amount */
  amount: number
  /** 1 for yearly; number of months for monthly programs (e.g. 2 for summer) */
  numberOfPeriods?: number
  startDate?: ISODate
  endDate?: ISODate
  isActive: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

/** What one student is expected to pay — the amount is frozen when created. */
export interface PaymentObligation {
  id: ID
  studentId: ID
  groupFeeId: ID
  academicYearId?: ID
  expectedAmount: number
  createdAt: ISODate
}

export type PaymentMethod = "CASH"

/** One cash transaction. The receipt is tracked independently of the money. */
export interface Payment {
  id: ID
  obligationId: ID
  studentId: ID
  amount: number
  paidAt: ISODate
  method: PaymentMethod
  receiptIssued: boolean
  /** Monthly programs: which month this payment is for (1-based) */
  periodNumber?: number
  note?: string
  recordedByUserId: ID
  createdAt: ISODate
}

/* ------------------------------------------------------------------ */
/* Public website CMS. Separate from operational data: PublicEvent ≠   */
/* Session, NewsArticle ≠ Announcement, QuranGraduate ≠ Student,       */
/* AdministrationMember ≠ the software ADMIN role. Arabic first,       */
/* French-ready (…Fr fields optional). Images are URLs (object storage */
/* later); in the mock phase local assets or transient blob: URLs.     */
/* ------------------------------------------------------------------ */

interface CmsTimestamps {
  createdAt: ISODate
  updatedAt: ISODate
}

/**
 * How the association is PRESENTED on the public website. Its identity
 * (official name, logo, phone, email, address) lives in AssociationSettings.
 */
export interface SiteSettings {
  shortDescriptionAr: string
  shortDescriptionFr?: string
  aboutAr: string
  aboutFr?: string
  historyAr?: string
  historyFr?: string
  missionAr: string
  missionFr?: string
  visionAr: string
  visionFr?: string
  /** One value per line */
  valuesAr?: string
  valuesFr?: string
  /** Opening hours / contact availability */
  openingHoursAr?: string
  mapUrl?: string
  facebookUrl?: string
  instagramUrl?: string
  youtubeUrl?: string
  registrationEnabled: boolean
  updatedAt: ISODate
}

/**
 * The association's official identity — ONE source read by every workspace
 * and by the public website (header, footer, contact page).
 */
export interface AssociationSettings {
  name: string
  /** Undefined = the bundled logo. A changed logo is a transient blob: preview until storage exists. */
  logoUrl?: string
  phone?: string
  email?: string
  address?: string
  updatedAt: ISODate
}

export type DateFormat = "DD/MM/YYYY" | "YYYY-MM-DD"
export type CalendarDefaultView = "week" | "rooms"
export type TablePageSize = 10 | 20 | 50

/**
 * Platform-wide configuration (/admin/settings). The current academic year
 * is NOT stored here: AcademicYear.isCurrent stays the single source of truth.
 */
export interface PlatformSettings {
  /** IANA zone; enforced server-side from Part 10 */
  timezone: string
  /** Numeric dates in administrative tables */
  dateFormat: DateFormat
  defaultCalendarView: CalendarDefaultView
  /** Rows per page in shared data tables */
  defaultPageSize: TablePageSize
  updatedAt: ISODate
}

export interface HeroSlide extends CmsTimestamps {
  id: ID
  imageUrl: string
  titleAr?: string
  titleFr?: string
  subtitleAr?: string
  subtitleFr?: string
  ctaLabelAr?: string
  ctaLabelFr?: string
  ctaHref?: string
  displayOrder: number
  isActive: boolean
}

/** "ماذا نقدم لطلابنا؟" */
export interface ServiceOffering extends CmsTimestamps {
  id: ID
  titleAr: string
  titleFr?: string
  descriptionAr?: string
  descriptionFr?: string
  /** Key of the website icon set */
  icon?: string
  displayOrder: number
  isPublished: boolean
}

/** Marketing view of what the association teaches — not an operational Group. */
export interface PublicProgram extends CmsTimestamps {
  id: ID
  titleAr: string
  titleFr?: string
  descriptionAr: string
  descriptionFr?: string
  imageUrl?: string
  icon?: string
  displayOrder: number
  isPublished: boolean
}

export type PublicGroupStatus = "COMING_SOON" | "OPEN" | "CLOSED"

/**
 * Public announcement of a group/program opening soon. Operational Groups
 * never appear publicly by themselves; this explicit record decides it.
 */
export interface PublicGroupListing extends CmsTimestamps {
  id: ID
  /** Optional link to the operational group it will become */
  groupId?: ID
  titleAr: string
  titleFr?: string
  audienceAr: string
  audienceFr?: string
  descriptionAr?: string
  descriptionFr?: string
  branchId?: ID
  startDate?: ISODate
  scheduleAr?: string
  imageUrl?: string
  publicStatus: PublicGroupStatus
  registrationOpen: boolean
  displayOrder: number
  isPublished: boolean
}

/** A public association activity — not a class Session. */
export interface PublicEvent extends CmsTimestamps {
  id: ID
  titleAr: string
  titleFr?: string
  descriptionAr: string
  descriptionFr?: string
  startDate: ISODate
  endDate?: ISODate
  time?: string
  location?: string
  imageUrl?: string
  isPublic: boolean
  isPublished: boolean
  isCancelled: boolean
}

/** Public news — not an internal Announcement. */
export interface NewsArticle extends CmsTimestamps {
  id: ID
  titleAr: string
  titleFr?: string
  excerptAr: string
  excerptFr?: string
  /** Plain text, paragraphs separated by blank lines */
  contentAr: string
  contentFr?: string
  coverImageUrl?: string
  publishedAt: ISODate
  isPublished: boolean
}

export type GalleryCategory = "ACTIVITIES" | "CEREMONIES" | "SESSIONS" | "SUMMER" | "LIFE"

export interface GalleryImage extends CmsTimestamps {
  id: ID
  imageUrl: string
  titleAr?: string
  titleFr?: string
  descriptionAr?: string
  descriptionFr?: string
  category?: GalleryCategory
  displayOrder: number
  isPublished: boolean
}

/** A publicly recognised Quran completer, entered explicitly by the admin. */
export interface QuranGraduate extends CmsTimestamps {
  id: ID
  /** Optional: a historical completer may no longer be a student */
  studentId?: ID
  fullName: string
  photoUrl?: string
  completionYear?: number
  completionDate?: ISODate
  shortMessage?: string
  displayOrder: number
  isPublished: boolean
}

/** Board member shown on the site — unrelated to the software ADMIN role. */
export interface AdministrationMember extends CmsTimestamps {
  id: ID
  userId?: ID
  fullName: string
  roleAr: string
  roleFr?: string
  photoUrl?: string
  shortBioAr?: string
  shortBioFr?: string
  displayOrder: number
  isPublished: boolean
}

export type AchievementCategory = "QURAN" | "COMPETITION" | "AWARD" | "COMMUNITY" | "ASSOCIATION" | "MILESTONE"

export interface Achievement extends CmsTimestamps {
  id: ID
  titleAr: string
  titleFr?: string
  descriptionAr: string
  descriptionFr?: string
  date?: ISODate
  year?: number
  imageUrl?: string
  category?: AchievementCategory
  /** Preferred for the home page — never overrides isPublished */
  isFeatured: boolean
  isPublished: boolean
  displayOrder: number
}

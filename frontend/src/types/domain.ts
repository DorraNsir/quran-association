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
 * One recurring weekly session of a group (a group usually has 2–3).
 * Teachers are not stored here: they come from the group's assignments.
 * branchId is kept alongside roomId for filtering, and always matches room.branchId.
 */
export interface WeeklySchedule extends ScheduleSlot {
  id: ID
  groupId: ID
  branchId: ID
  roomId: ID
}

export type ConflictType = "ROOM" | "TEACHER" | "GROUP"

/** Why a candidate session cannot be scheduled (frontend UX check only). */
export interface ScheduleConflict {
  type: ConflictType
  /** The existing session it collides with */
  schedule: WeeklySchedule
  /** For TEACHER conflicts: the teachers booked in both groups */
  teacherIds: ID[]
}
/**
 * Teaching assignments live on the group: exactly one supervisor,
 * zero or more assistants. Group membership lives on the student,
 * and weekly sessions live in WeeklySchedule (by groupId).
 */
export interface Group {
  id: ID
  name: string
  /** Target audience, e.g. "أطفال 7–10 سنوات" */
  audience: string
  /** Usual location — the default for new sessions; each session has its own room */
  branchId: ID
  roomId: ID
  supervisorId: ID
  assistantIds: ID[]
  status: GroupStatus
  createdAt: ISODate
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
  /** The student's single active group */
  groupId: ID
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
  groupId: ID
  /** The weekly slot this session comes from */
  scheduleId: ID
  date: ISODate
  branchId: ID
  roomId: ID
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

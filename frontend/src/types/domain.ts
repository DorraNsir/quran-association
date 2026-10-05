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

export type Gender = "MALE" | "FEMALE"

/** Responsibility of a teacher inside one group */
export type TeachingRole = "SUPERVISOR" | "ASSISTANT"

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"

export interface Room {
  id: ID
  branchId: ID
  name: string
}

export interface Branch {
  id: ID
  name: string
  address: string
  status: BranchStatus
  rooms: Room[]
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

export interface ScheduleSlot {
  day: Weekday
  start: TimeOfDay
  end: TimeOfDay
}

/**
 * Teaching assignments live on the group: exactly one supervisor,
 * zero or more assistants. Group membership lives on the student.
 */
export interface Group {
  id: ID
  name: string
  /** Target audience, e.g. "أطفال 7–10 سنوات" */
  audience: string
  branchId: ID
  roomId: ID
  supervisorId: ID
  assistantIds: ID[]
  schedule: ScheduleSlot[]
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

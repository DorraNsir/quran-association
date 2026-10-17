/**
 * «متابعة العمل» — the API's shapes (GET /api/teacher/work-programs…).
 * Student → Session → Work program (one per student per session) → Work items.
 * The program's date, time, class and branch always come from its session.
 */
import type { ID, ISODate, SessionStatus } from "@/types/domain"

export type WorkType = "MEMORIZATION" | "REVISION" | "RECITATION" | "EXAM"

/** CANCELLED = this work item was dropped (not a cancelled session); it stays in its program. */
export type WorkStatus = "NOT_EVALUATED" | "COMPLETED" | "NOT_COMPLETED" | "PARTIAL" | "POSTPONED" | "CANCELLED"

export interface WorkSession {
  id: ID
  date: ISODate
  startTime: string
  endTime: string
  status: SessionStatus
  groupClassId: ID
  groupName: string
  branchName: string
}

/** Another item this one is linked to, with its session's date. */
export interface WorkItemLink {
  itemId: ID
  programId: ID
  sessionId: ID
  sessionDate: ISODate
}

export interface WorkItem {
  id: ID
  /** Optimistic concurrency: sent back with every change */
  version: number
  position: number
  type: WorkType
  description: string
  status: WorkStatus
  /** عرضة only: 1, 2, 3… (no maximum) */
  recitationNumber: number | null
  evaluationComment: string | null
  evaluatedAt: string | null
  evaluatedBy: string | null
  /** Continues an unfinished item of an earlier session — with that item's status WHEN it was carried */
  carriedFrom: (WorkItemLink & { status: WorkStatus }) | null
  /** The previous numbered recitation this one follows */
  continuedFrom: (WorkItemLink & { recitationNumber: number | null }) | null
  /** Carried into later sessions */
  carriedTo: WorkItemLink[]
  /** Its next recitation(s) */
  continuedBy: WorkItemLink[]
}

export interface WorkProgress {
  total: number
  /** total − cancelled */
  active: number
  /** COMPLETED only */
  completed: number
  /** NOT_EVALUATED */
  pending: number
  /** NOT_COMPLETED + PARTIAL + POSTPONED */
  unfinished: number
  cancelled: number
  /** null when there is no active item */
  rate: number | null
}

export interface WorkProgram {
  id: ID
  /** Optimistic concurrency of the notes */
  version: number
  student: { id: ID; firstName: string; lastName: string; photoUrl: string | null }
  session: WorkSession
  /** «ملاحظات المعلم» — not the private «ملاحظاتي» notes */
  generalNotes: string | null
  lastEditedBy: string | null
  createdAt: string
  updatedAt: string
  progress: WorkProgress
  items: WorkItem[]
}

/** A student's own work program (GET /api/student/work-programs) — read-only, no internal metadata. */
export interface StudentWorkProgram {
  id: ID
  session: WorkSession
  /** The teacher who planned it (else the session supervisor) */
  teacherName: string | null
  progress: WorkProgress
  items: {
    id: ID
    type: WorkType
    description: string
    status: WorkStatus
    recitationNumber: number | null
    /** Only once the item is evaluated */
    evaluationComment: string | null
    /** Carried from an earlier session: its date and the result then */
    carriedFrom: { sessionDate: ISODate; status: WorkStatus } | null
  }[]
}

/**
 * «متابعة العمل» — the API's shapes (GET /api/teacher/work-programs…).
 * Student → Session → Work program (one per student per session) → Work items.
 * The program's date, time, class and branch always come from its session.
 */
import type { WorkAssignment, WorkloadSnapshot, WorkPerformance } from "@/lib/quran-reference/work-assignment"
import type { ID, ISODate, SessionStatus } from "@/types/domain"

export type { AssignmentPayload, WorkAssignment, WorkloadSnapshot, WorkPerformance } from "@/lib/quran-reference/work-assignment"

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

/** «متابعة العرضات»: what an item is in its surah's history (POSTPONED: «لا تحتسب»). */
export type RecitationEntry = "COMPLETED" | "PARTIAL" | "NOT_COMPLETED" | "CANCELLED" | "POSTPONED" | "PENDING" | "SESSION_CANCELLED"

/** A structured عرضة: its surah and how many recitations of it the student has done. */
export interface RecitationSummary {
  surah: number
  attempts: number
}

export interface RecitationAttempt {
  itemId: ID
  programId: ID
  sessionId: ID
  sessionDate: ISODate
  /** Stored number (a rescheduled postponed recitation keeps it); null for an old item without one */
  number: number | null
  entry: RecitationEntry
  status: WorkStatus
  evaluationComment: string | null
  evaluatedAt: string | null
  evaluatedBy: string | null
}

export interface RecitationSurahHistory {
  surah: number
  /** Recitations done with a result */
  attempts: number
  nextNumber: number
  /** Chronological */
  entries: RecitationAttempt[]
}

export interface RecitationHistory {
  studentId: ID
  surahs: RecitationSurahHistory[]
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
  /** Structured Quranic assignment (null: a free-text item, e.g. every item saved before Work Program 2.0) */
  assignment: WorkAssignment | null
  /** Computed and stored by the server when the assignment was saved — never computed here */
  workload: WorkloadSnapshot | null
  /** «متابعة العرضات»: a structured عرضة's surah and recitations done (null otherwise) */
  recitation?: RecitationSummary | null
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

/** Server-side advisory order of a session's programs by assigned work (pages, exact or bounded). */
export interface WorkloadOrder {
  /** false: some work has no measurable size — listed after the others, never treated as zero */
  comparable: boolean
  /** Consecutive programs whose sizes cannot be told apart share a group (not a rank) */
  group: number | null
  pages: { lo: number; hi: number; exact: boolean } | null
  examPages: { lo: number; hi: number; exact: boolean } | null
  reason: "FREE_TEXT" | "UNMEASURED" | "EDITION" | null
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
  /** «التقييم العام»: the teacher's holistic judgment (null: not given yet) — separate from the items' results */
  overallEvaluation?: { level: WorkPerformance; evaluatedAt: string; evaluatedBy: string | null } | null
  createdAt: string
  updatedAt: string
  progress: WorkProgress
  /**
   * The server's verdict (its clock, Africa/Tunis) when this response was
   * built: evaluation opens once the session has started and never for a
   * cancelled one. The evaluation endpoints enforce the same rule (409).
   */
  evaluation: WorkEvaluationState
  items: WorkItem[]
  /** «ترتيب حسب البرنامج» (only with order=workload): where it stands in the advisory order — never a rank */
  workloadOrder?: WorkloadOrder
}

export interface WorkEvaluationState {
  allowed: boolean
  blockedReason: "SESSION_NOT_STARTED" | "SESSION_CANCELLED" | null
}

/** A student's own work program (GET /api/student/work-programs) — read-only, no internal metadata. */
export interface StudentWorkProgram {
  id: ID
  session: WorkSession
  /** The teacher who planned it (else the session supervisor) */
  teacherName: string | null
  progress: WorkProgress
  /** «التقييم العام» given by the teacher (null: not yet) */
  overallEvaluation?: { level: WorkPerformance; evaluatedAt: string } | null
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
    /** What to work on, structured (null: free text) — students do not receive the workload */
    assignment: WorkAssignment | null
  }[]
}

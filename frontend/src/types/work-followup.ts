/**
 * «متابعة العمل» — PROTOTYPE types (frontend only, mock data). Hierarchy:
 * Student → Session → Work program (one per student per session) → Work items.
 * Kept isolated so they can later be replaced by the API's DTOs.
 */
import type { ID, ISODate } from "@/types/domain"

export type WorkType = "MEMORIZATION" | "REVISION" | "RECITATION" | "EXAM"

export type WorkStatus = "NOT_EVALUATED" | "COMPLETED" | "NOT_COMPLETED" | "PARTIAL" | "POSTPONED"

export interface WorkItem {
  id: ID
  type: WorkType
  description: string
  status: WorkStatus
  /** عرضة only: 1, 2, 3… (no maximum) */
  recitationNumber?: number
  evaluationComment?: string
  /** Continues an unfinished item of an earlier session («نقل إلى الحصة القادمة») */
  carriedFromItemId?: ID
}

/** One student's work for ONE session — its date always comes from the session. */
export interface WorkProgram {
  id: ID
  studentId: ID
  sessionId: ID
  items: WorkItem[]
  /** «ملاحظات المعلم» — not the private «ملاحظاتي» notes */
  generalNotes?: string
  lastEditedBy: string
}

export interface MockClass {
  id: ID
  groupName: string
  branchName: string
}

export interface MockStudent {
  id: ID
  firstName: string
  lastName: string
  groupClassId: ID
  photoUrl?: string
}

export interface MockSession {
  id: ID
  groupClassId: ID
  date: ISODate
  start: string
  end: string
  status: "SCHEDULED" | "CANCELLED"
}

export interface WorkFollowupData {
  /** The signed-in teacher (mock) — shown as the author of new changes */
  me: string
  classes: MockClass[]
  students: MockStudent[]
  sessions: MockSession[]
  programs: WorkProgram[]
}

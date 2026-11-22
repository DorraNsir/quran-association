import type {
  AssignmentPayload,
  RecitationEntry,
  WorkAssignment,
  WorkloadSnapshot,
  WorkPerformance,
} from '@/features/quran-reference/work-assignment';

import type { SessionStatus } from './types';

export type { AssignmentPayload, WorkAssignment, WorkloadSnapshot } from '@/features/quran-reference/work-assignment';

/*
 * «متابعة برنامج العمل» DTOs — backend work-followup.dto.ts (teacher routes).
 * One program = ONE student × ONE dated session, with ordered work items.
 */
export type WorkType = 'MEMORIZATION' | 'REVISION' | 'RECITATION' | 'EXAM';
export type WorkStatus = 'NOT_EVALUATED' | 'COMPLETED' | 'NOT_COMPLETED' | 'PARTIAL' | 'POSTPONED' | 'CANCELLED';
export type WorkPeriod = 'upcoming' | 'past';
export type WorkProgramState = 'pending' | 'unfinished' | 'cancelled' | 'done';

export interface WorkSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  groupClassId: string;
  groupName: string;
  branchName: string;
}

/** An upcoming session that may receive work; programId = the student's existing program there. */
export interface EligibleSession extends WorkSession {
  programId: string | null;
}

export interface WorkItemLink {
  itemId: string;
  programId: string;
  sessionId: string;
  sessionDate: string;
}

export interface WorkItem {
  id: string;
  version: number;
  position: number;
  type: WorkType;
  description: string;
  status: WorkStatus;
  recitationNumber: number | null;
  evaluationComment: string | null;
  evaluatedAt: string | null;
  evaluatedBy: string | null;
  /** The source's status WHEN it was carried */
  carriedFrom: (WorkItemLink & { status: WorkStatus }) | null;
  continuedFrom: (WorkItemLink & { recitationNumber: number | null }) | null;
  carriedTo: WorkItemLink[];
  continuedBy: WorkItemLink[];
  /** Structured Quranic assignment (null: a free-text item, e.g. every item saved before Work Program 2.0) */
  assignment: WorkAssignment | null;
  /** Computed and stored by the server when the assignment was saved — never computed here */
  workload: WorkloadSnapshot | null;
  /** «متابعة العرضات»: a structured عرضة's surah and recitations done (null otherwise) */
  recitation?: RecitationSummary | null;
}

/** A structured عرضة: its surah and how many recitations of it the student has done (server values). */
export interface RecitationSummary {
  surah: number;
  attempts: number;
}

export interface RecitationAttempt {
  itemId: string;
  programId: string;
  sessionId: string;
  sessionDate: string;
  /** Stored number (a rescheduled postponed recitation keeps it); null for an old item without one */
  number: number | null;
  entry: RecitationEntry;
  status: WorkStatus;
  evaluationComment: string | null;
  evaluatedAt: string | null;
  evaluatedBy: string | null;
}

export interface RecitationSurahHistory {
  surah: number;
  /** Recitations done with a result */
  attempts: number;
  nextNumber: number;
  /** Chronological */
  entries: RecitationAttempt[];
}

export interface RecitationHistory {
  studentId: string;
  surahs: RecitationSurahHistory[];
}

/** Computed by the server: only COMPLETED is done, CANCELLED is out of the active total. */
export interface WorkProgress {
  total: number;
  active: number;
  completed: number;
  pending: number;
  unfinished: number;
  cancelled: number;
  rate: number | null;
}

export interface WorkProgram {
  id: string;
  version: number;
  student: { id: string; firstName: string; lastName: string; photoUrl: string | null };
  session: WorkSession;
  generalNotes: string | null;
  lastEditedBy: string | null;
  /** «التقييم العام»: the teacher's holistic judgment (null: not given yet) — separate from the items' results */
  overallEvaluation?: { level: WorkPerformance; evaluatedAt: string; evaluatedBy: string | null } | null;
  createdAt: string;
  updatedAt: string;
  progress: WorkProgress;
  /** The server's verdict (its clock, platform timezone) when the response was built; the evaluation endpoints enforce it (409) */
  evaluation: WorkEvaluationState;
  items: WorkItem[];
  /** Only with order=workload */
  workloadOrder?: WorkloadOrder;
}

export interface WorkEvaluationState {
  allowed: boolean;
  blockedReason: 'SESSION_NOT_STARTED' | 'SESSION_CANCELLED' | null;
}

export interface WorkProgramFilters {
  q?: string;
  studentId?: string;
  groupClassId?: string;
  sessionId?: string;
  period?: WorkPeriod;
  state?: WorkProgramState;
  /** «ترتيب حسب البرنامج» (needs sessionId): the server orders the whole session before paginating */
  order?: 'workload';
}

/** Server-side advisory order of a session's programs by assigned work (pages) — never a rank. */
export interface WorkloadOrder {
  /** false: some work has no measurable size — listed after the others, never treated as zero */
  comparable: boolean;
  /** Consecutive programs whose sizes cannot be told apart share a group (not a rank) */
  group: number | null;
  pages: { lo: number; hi: number; exact: boolean } | null;
  examPages: { lo: number; hi: number; exact: boolean } | null;
  reason: 'FREE_TEXT' | 'UNMEASURED' | 'EDITION' | null;
}

export interface NewWorkItem {
  type: WorkType;
  /** Optional with an assignment: the server then writes the default description */
  description?: string;
  recitationNumber?: number | null;
  /** References only; the server validates them and computes the workload */
  assignment?: AssignmentPayload;
}

export interface WorkItemPatch {
  id: string;
  version: number;
  type?: WorkType;
  description?: string;
  recitationNumber?: number | null;
  /** Omitted: unchanged · null: back to free text · an object: the new assignment */
  assignment?: AssignmentPayload | null;
}

export interface EvaluationLine {
  id: string;
  version: number;
  status: WorkStatus;
  evaluationComment?: string | null;
}

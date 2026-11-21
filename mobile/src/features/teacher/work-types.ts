import type { AssignmentPayload, RecitationEntry, WorkAssignment, WorkloadSnapshot } from '@/features/quran-reference/work-assignment';

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
  /** «متابعة العرضات»: the cycle of a tracked عرضة (null: another type, free text, or planned before cycles) */
  recitationCycle?: RecitationCycleSummary | null;
}

/** A tracked عرضة's cycle (four successful recitations per surah and cycle) — server values. */
export interface RecitationCycleSummary {
  cycleId: string;
  surah: number;
  number: number;
  successes: number;
  required: number;
  completed: boolean;
  /** This item's chronological attempt number (null: not an attempt) */
  attemptNumber: number | null;
  entry: RecitationEntry;
}

export interface RecitationAttempt {
  itemId: string;
  programId: string;
  sessionId: string;
  sessionDate: string;
  attemptNumber: number | null;
  entry: RecitationEntry;
  status: WorkStatus;
  evaluationComment: string | null;
  evaluatedAt: string | null;
  evaluatedBy: string | null;
}

export interface RecitationCycle {
  id: string;
  number: number;
  successes: number;
  required: number;
  attempts: number;
  completed: boolean;
  completedAt: string | null;
  startedAt: string;
  /** Chronological */
  entries: RecitationAttempt[];
}

export interface RecitationSurahHistory {
  surah: number;
  /** Oldest first; the last one is the current cycle */
  cycles: RecitationCycle[];
  /** Recitations planned before cycles existed: shown as recorded, never counted */
  earlier: RecitationAttempt[];
  canStartNewCycle: boolean;
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
  createdAt: string;
  updatedAt: string;
  progress: WorkProgress;
  /** The server's verdict (its clock, platform timezone) when the response was built; the evaluation endpoints enforce it (409) */
  evaluation: WorkEvaluationState;
  items: WorkItem[];
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

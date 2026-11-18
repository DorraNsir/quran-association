import type { SessionStatus } from './types';

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
  description: string;
  recitationNumber?: number | null;
}

export interface WorkItemPatch {
  id: string;
  version: number;
  type?: WorkType;
  description?: string;
  recitationNumber?: number | null;
}

export interface EvaluationLine {
  id: string;
  version: number;
  status: WorkStatus;
  evaluationComment?: string | null;
}

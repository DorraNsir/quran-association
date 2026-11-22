import type { IconName, PillTone } from '@/components/ui';
import { formatDate, formatDateLong } from '@/i18n/format';
import {
  draftFromAssignment,
  emptyDraft,
  isBlankDraft,
  sameAssignment,
  toPayload,
  validateItemDraft,
  type AssignmentPayload,
  type AssignmentDraft,
} from '@/features/quran-reference/work-assignment';
import { ApiError } from '@/services/api';

import { normalizeArabic } from '../quran/surahs';
import { platformClock } from './dashboard-model';
import type { SessionStatus } from './types';
import type {
  EvaluationLine,
  NewWorkItem,
  WorkItem,
  WorkItemPatch,
  WorkProgram,
  WorkProgress,
  WorkSession,
  WorkStatus,
  WorkType,
} from './work-types';

/*
 * «متابعة برنامج العمل» — display and validation rules (the web's
 * lib/work-followup.ts and forms). The API stays the authority: eligibility,
 * numbering, progress and permissions are its own; these only label, pre-fill
 * and check the DTO limits before sending.
 */
export const DESCRIPTION_MAX = 2000;
export const COMMENT_MAX = 1000;
export const NOTES_MAX = 2000;
export const ITEMS_MAX = 50;

export const WORK_TYPES: readonly WorkType[] = ['MEMORIZATION', 'REVISION', 'RECITATION', 'EXAM'];
export const WORK_STATUSES: readonly WorkStatus[] = ['NOT_EVALUATED', 'COMPLETED', 'NOT_COMPLETED', 'PARTIAL', 'POSTPONED', 'CANCELLED'];

export const WORK_TYPE_ICON: Record<WorkType, IconName> = {
  MEMORIZATION: 'classes',
  REVISION: 'revision',
  RECITATION: 'recitation',
  EXAM: 'exam',
};

/** The web's status styles: green done, red not done, amber partial, sky postponed, gray dropped/pending; icon + label always. */
export const WORK_STATUS_STYLE: Record<WorkStatus, { tone: PillTone; icon: IconName }> = {
  NOT_EVALUATED: { tone: 'muted', icon: 'pending' },
  COMPLETED: { tone: 'success', icon: 'success' },
  NOT_COMPLETED: { tone: 'danger', icon: 'notDone' },
  PARTIAL: { tone: 'warning', icon: 'partial' },
  POSTPONED: { tone: 'info', icon: 'clock' },
  CANCELLED: { tone: 'muted', icon: 'ban' },
};

/**
 * Results that may be continued in a later session («نقل إلى الحصة القادمة»)
 * — the API's rule: an unfinished result, or — from a CANCELLED session,
 * whose work is never evaluated — an item still unevaluated.
 */
export const isTransferable = (status: WorkStatus, sessionStatus?: SessionStatus) =>
  status === 'NOT_COMPLETED' ||
  status === 'PARTIAL' ||
  status === 'POSTPONED' ||
  status === 'CANCELLED' ||
  (status === 'NOT_EVALUATED' && sessionStatus === 'CANCELLED');

/** Why «تقييم الأعمال» is closed now (null: open). */
export type EvaluationBlock = 'NOT_STARTED' | 'CANCELLED';

/**
 * Evaluation opens once the session has STARTED (its current date and start
 * time, platform timezone) — during and after it, completed included — and
 * never for a cancelled session. The server's verdict decides; the clock only
 * OPENS a «not started yet» once the start minute has come while the screen
 * stays open. A wrong phone clock never opens what the server closed for
 * another reason, and the API refuses anything early (409) anyway.
 */
export function evaluationBlockOf(
  program: Pick<WorkProgram, 'session' | 'evaluation'>,
  timeZone: string | undefined,
  now = new Date(),
): EvaluationBlock | null {
  const { session, evaluation } = program;
  if (session.status === 'CANCELLED' || evaluation?.blockedReason === 'SESSION_CANCELLED') return 'CANCELLED';
  const clock = platformClock(timeZone, now);
  const started = session.date < clock.today || (session.date === clock.today && session.startTime <= clock.time);
  // Without the server's verdict (an older API): the clock alone
  if (!evaluation) return started ? null : 'NOT_STARTED';
  return evaluation.blockedReason === 'SESSION_NOT_STARTED' && !started ? 'NOT_STARTED' : null;
}

/** The API refused an evaluation because of the session (not started / cancelled): reload its state. */
export const isEvaluationClosedError = (error: unknown) =>
  error instanceof ApiError && (error.code === 'WORK_SESSION_NOT_STARTED' || error.code === 'WORK_SESSION_CANCELLED');

export type SessionPhase = 'UPCOMING' | 'ONGOING' | 'PAST';

/** Where a session stands now, in PLATFORM time (the web's phaseOf). */
export function phaseOf(session: Pick<WorkSession, 'date' | 'startTime' | 'endTime'>, timeZone: string | undefined, now = new Date()): SessionPhase {
  const clock = platformClock(timeZone, now);
  if (session.date > clock.today) return 'UPCOMING';
  if (session.date < clock.today) return 'PAST';
  if (clock.time < session.startTime) return 'UPCOMING';
  return clock.time < session.endTime ? 'ONGOING' : 'PAST';
}

/** «الاثنين 16 نوفمبر 2026» — the time range is shown apart (TimeRange). */
export const sessionDay = (session: Pick<WorkSession, 'date'>) => formatDateLong(session.date);
export const shortDate = (date: string) => formatDate(date);

export const studentName = (p: Pick<WorkProgram, 'student'>) => `${p.student.firstName} ${p.student.lastName}`;

/** The web's progressLabel: never a misleading %, cancelled items counted apart. */
export function progressLabel(p: WorkProgress): string {
  if (p.total === 0) return 'لا توجد أعمال';
  if (p.active === 0) return 'لا توجد أعمال نشطة';
  if (p.completed === 0) return `${p.active} ${p.active === 1 ? 'عمل' : 'أعمال'} بانتظار الإنجاز`;
  // «جميع الأعمال» only when EVERY item is done — never when some were dropped (1 منجز + 1 ملغى)
  if (p.completed === p.total) return `تم إنجاز جميع الأعمال (${p.completed}/${p.total})`;
  if (p.completed === p.active) return `تم إنجاز ${p.completed} من أصل ${p.total} أعمال`;
  return `تم إنجاز ${p.completed} من أصل ${p.active} ${p.cancelled ? 'أعمال نشطة' : 'أعمال'}`;
}

export const cancelledLabel = (n: number) => (n === 1 ? 'عمل ملغى واحد' : n === 2 ? 'عملان ملغيان' : `${n} أعمال ملغاة`);

/** The approved rule for a DRAFT (the evaluation form); the server answers the same numbers. */
export function progressOf(items: readonly Pick<WorkItem, 'status'>[]): WorkProgress {
  const count = (test: (s: WorkStatus) => boolean) => items.filter((i) => test(i.status)).length;
  const total = items.length;
  const cancelled = count((s) => s === 'CANCELLED');
  const active = total - cancelled;
  const completed = count((s) => s === 'COMPLETED');
  return {
    total,
    active,
    completed,
    pending: count((s) => s === 'NOT_EVALUATED'),
    unfinished: count((s) => s === 'NOT_COMPLETED' || s === 'PARTIAL' || s === 'POSTPONED'),
    cancelled,
    rate: active > 0 ? Math.round((completed / active) * 1000) / 10 : null,
  };
}

const ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
export const recitationOrdinal = (n: number) => ORDINALS[n - 1] ?? `رقم ${n}`;

/** The web's proposal for «إضافة العرضة التالية» (the teacher may edit it; the API sets the number). */
export function nextRecitation(item: Pick<WorkItem, 'description' | 'recitationNumber'>) {
  const number = (item.recitationNumber ?? 1) + 1;
  const base = item.description.replace(/^إكمال\s+/, '');
  const pattern = new RegExp(`العرضة\\s+(${ORDINALS.join('|')}|رقم\\s+\\d+)`);
  const description = pattern.test(base)
    ? base.replace(pattern, `العرضة ${recitationOrdinal(number)}`)
    : `العرضة ${recitationOrdinal(number)} — ${base}`;
  return { number, description };
}

// ───────────────────────── evaluation draft ─────────────────────────

export type EvaluationDraft = Record<string, { status: WorkStatus; comment: string }>;

export const evaluationDraftOf = (program: WorkProgram): EvaluationDraft =>
  Object.fromEntries(program.items.map((i) => [i.id, { status: i.status, comment: i.evaluationComment ?? '' }]));

/** Only the changed items, each with the version it was loaded at (the web's rule). */
export function evaluationBody(program: WorkProgram, draft: EvaluationDraft, notes: string) {
  const items: EvaluationLine[] = program.items
    .filter((i) => {
      const d = draft[i.id];
      return d && (d.status !== i.status || (d.comment.trim() || null) !== i.evaluationComment);
    })
    .map((i) => ({ id: i.id, version: i.version, status: draft[i.id]!.status, evaluationComment: draft[i.id]!.comment.trim() || null }));
  const generalNotes = notes.trim() || null;
  const notesChanged = generalNotes !== program.generalNotes;
  return { items, ...(notesChanged ? { version: program.version, generalNotes } : {}), changed: items.length > 0 || notesChanged };
}

export function validateEvaluation(draft: EvaluationDraft, notes: string): 'commentTooLong' | 'notesTooLong' | null {
  if (Object.values(draft).some((d) => d.comment.trim().length > COMMENT_MAX)) return 'commentTooLong';
  if (notes.trim().length > NOTES_MAX) return 'notesTooLong';
  return null;
}

// ───────────────────────── planning draft ─────────────────────────

export interface DraftItem {
  key: string;
  /** A saved item (edit): kept, never deleted from here — a dropped one is evaluated «ملغى» */
  saved?: WorkItem;
  type: WorkType;
  description: string;
  recitationNumber: string;
  /** Structured Quranic assignment, or free text (mode 'free') */
  assignment: AssignmentDraft;
}

let draftSeq = 0;
export const blankItem = (): DraftItem => ({
  key: `d${++draftSeq}`,
  type: 'REVISION',
  description: '',
  recitationNumber: '',
  assignment: emptyDraft('REVISION'),
});
export const toDraft = (i: WorkItem): DraftItem => ({
  key: i.id,
  saved: i,
  type: i.type,
  description: i.description,
  recitationNumber: i.recitationNumber ? String(i.recitationNumber) : '',
  // A legacy item stays free text: its description is never parsed into references
  assignment: draftFromAssignment(i.type, i.assignment),
});

/*
 * The web form's rules (frontend work-program-form.tsx), on the shared generated module.
 * New items are structured only (no free-text fallback); free text exists only for items saved as
 * free text before Work Program 2.0 — kept as written, converted only by an explicit choice.
 */
export const isStructured = (d: DraftItem) => d.assignment.mode !== 'free';
/**
 * «متابعة العرضات»: the server numbers a structured عرضة (a new one, or one already in a cycle);
 * a legacy item keeps its own number field (the web's rule).
 */
export const isManagedNumber = (d: DraftItem) => isStructured(d);
/** An item saved as free text (legacy): it may stay free text. */
export const isLegacyFreeText = (d: DraftItem) => Boolean(d.saved && !d.saved.assignment);
/** A new item with nothing selected yet: ignored on save (an extra blank item never blocks it). */
export const isUntouched = (d: DraftItem) => !d.saved && isStructured(d) && isBlankDraft(d.assignment);
/** The problem of an item's assignment, if any (structured references, or legacy free text). */
export const assignmentError = (d: DraftItem) => (isUntouched(d) ? null : validateItemDraft(d.type, d.assignment, isLegacyFreeText(d)));

/** عرضة only: a positive whole number, else none (the web's numberOf). */
export const numberOf = (d: DraftItem) =>
  d.type === 'RECITATION' && /^\d+$/.test(d.recitationNumber.trim()) && Number(d.recitationNumber) > 0 ? Number(d.recitationNumber) : null;

export type PlanError =
  | 'studentRequired'
  | 'sessionRequired'
  | 'itemsRequired'
  | 'descriptionRequired'
  | 'assignmentInvalid'
  | 'descriptionTooLong'
  | 'notesTooLong'
  | 'tooManyItems'
  | 'numberInvalid'
  | 'numberRequired';

export function validatePlan(input: { studentId: string; sessionId: string; items: readonly DraftItem[]; notes: string }): PlanError | null {
  if (!input.studentId) return 'studentRequired';
  if (!input.sessionId) return 'sessionRequired';
  const filled = input.items.filter((i) => !isUntouched(i));
  if (filled.length === 0) return 'itemsRequired';
  if (filled.some((i) => assignmentError(i))) return 'assignmentInvalid';
  // A legacy free-text item kept as free text keeps a description
  if (filled.some((i) => !isStructured(i) && !i.description.trim())) return 'descriptionRequired';
  if (input.items.length > ITEMS_MAX) return 'tooManyItems';
  if (input.items.some((i) => i.description.trim().length > DESCRIPTION_MAX)) return 'descriptionTooLong';
  if (input.items.some((i) => i.type === 'RECITATION' && i.recitationNumber.trim() && numberOf(i) === null)) return 'numberInvalid';
  // A next recitation keeps its type and number (WORK_ITEM_TYPE_LOCKED / WORK_RECITATION_NUMBER_REQUIRED)
  if (input.items.some((i) => i.saved?.continuedFrom && numberOf(i) === null)) return 'numberRequired';
  if (input.notes.trim().length > NOTES_MAX) return 'notesTooLong';
  return null;
}

export const newItemsOf = (items: readonly DraftItem[]): NewWorkItem[] =>
  items
    .filter((d) => !d.saved && !isUntouched(d))
    // Structured only: the server writes the description from the references
    .map((d) => ({ type: d.type, recitationNumber: numberOf(d), assignment: toPayload(d.assignment) as AssignmentPayload }));

/** Edit: only what changed, each saved item with the version it was edited from (the web's rule). */
export function updateBody(program: WorkProgram, items: readonly DraftItem[], notes: string) {
  const changed: WorkItemPatch[] = items
    .filter((d): d is DraftItem & { saved: WorkItem } => Boolean(d.saved))
    .flatMap((d) => {
      const assignment = toPayload(d.assignment);
      const description = d.description.trim();
      // Only what really changed: an unchanged text is not resent, so the server keeps its
      // default description in step with a changed range
      const descriptionChanged = description !== d.saved.description && description !== '';
      const assignmentChanged = !sameAssignment(d.saved.assignment, assignment);
      if (!descriptionChanged && !assignmentChanged && d.type === d.saved.type && numberOf(d) === d.saved.recitationNumber) return [];
      return [
        {
          id: d.saved.id,
          version: d.saved.version,
          type: d.type,
          recitationNumber: numberOf(d),
          ...(descriptionChanged ? { description } : {}),
          ...(assignmentChanged ? { assignment } : {}),
        },
      ];
    });
  const newItems = newItemsOf(items);
  const generalNotes = notes.trim() || null;
  const notesChanged = generalNotes !== program.generalNotes;
  return {
    body: {
      ...(notesChanged ? { version: program.version, generalNotes } : {}),
      ...(changed.length ? { items: changed } : {}),
      ...(newItems.length ? { newItems } : {}),
    },
    changed: notesChanged || changed.length > 0 || newItems.length > 0,
  };
}

// ───────────────────────── errors ─────────────────────────

export type WorkErrorKind = 'offline' | 'conflict' | 'exists' | 'notUpcoming' | 'notFound' | 'forbidden' | 'invalid' | 'unknown';

/** Every failure keeps the form; the kind decides what is offered (never «denied» for a network failure). */
export function classifyWorkError(error: unknown): WorkErrorKind {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  if (error.code === 'WORK_ITEM_CHANGED' || error.code === 'WORK_PROGRAM_CHANGED') return 'conflict';
  if (error.code === 'WORK_PROGRAM_EXISTS') return 'exists';
  if (error.code === 'WORK_SESSION_NOT_UPCOMING' || error.code === 'WORK_SESSION_CANCELLED') return 'notUpcoming';
  if (error.isNotFound) return 'notFound';
  if (error.isForbidden) return 'forbidden';
  if (error.status === 400) return 'invalid';
  return 'unknown';
}

/** WORK_PROGRAM_EXISTS carries the existing program's id (edit it instead). */
export function existingProgramId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'WORK_PROGRAM_EXISTS') return null;
  const body = error.body as { programId?: unknown } | undefined;
  return typeof body?.programId === 'string' ? body.programId : null;
}

/** A student of the «اختر الطالب» sheet (photo from the teacher workspace). */
export interface StudentOption {
  id: string;
  name: string;
  photoUrl: string | null;
}
export interface StudentGroup {
  id: string;
  label: string;
  students: StudentOption[];
}

/**
 * «البحث عن طالب»: the groups whose students match the query (the web's rule: Latin case,
 * tashkeel and tatweel ignored, أ/إ/آ → ا, ة → ه, ى → ي), each with its matching students only;
 * groups without a match are left out. An empty query keeps everything.
 */
export function filterStudentGroups(groups: readonly StudentGroup[], query: string): StudentGroup[] {
  const needle = normalizeArabic(query);
  if (!needle) return groups.filter((g) => g.students.length > 0);
  return groups
    .map((g) => ({ ...g, students: g.students.filter((s) => normalizeArabic(s.name).includes(needle)) }))
    .filter((g) => g.students.length > 0);
}

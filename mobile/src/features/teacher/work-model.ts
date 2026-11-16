import type { IconName, PillTone } from '@/components/ui';
import { formatDate, formatDateLong } from '@/i18n/format';
import { ApiError } from '@/services/api';

import { platformClock } from './dashboard-model';
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

/** Results that may be continued in a later session («نقل إلى الحصة القادمة») — the API's TRANSFERABLE. */
export const isTransferable = (status: WorkStatus) =>
  status === 'NOT_COMPLETED' || status === 'PARTIAL' || status === 'POSTPONED' || status === 'CANCELLED';

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
  if (p.completed === p.active) return `تم إنجاز جميع الأعمال (${p.completed}/${p.active})`;
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
}

let draftSeq = 0;
export const blankItem = (): DraftItem => ({ key: `d${++draftSeq}`, type: 'REVISION', description: '', recitationNumber: '' });
export const toDraft = (i: WorkItem): DraftItem => ({
  key: i.id,
  saved: i,
  type: i.type,
  description: i.description,
  recitationNumber: i.recitationNumber ? String(i.recitationNumber) : '',
});

/** عرضة only: a positive whole number, else none (the web's numberOf). */
export const numberOf = (d: DraftItem) =>
  d.type === 'RECITATION' && /^\d+$/.test(d.recitationNumber.trim()) && Number(d.recitationNumber) > 0 ? Number(d.recitationNumber) : null;

export type PlanError = 'studentRequired' | 'sessionRequired' | 'itemsRequired' | 'descriptionTooLong' | 'notesTooLong' | 'tooManyItems' | 'numberInvalid' | 'numberRequired';

export function validatePlan(input: { studentId: string; sessionId: string; items: readonly DraftItem[]; notes: string }): PlanError | null {
  if (!input.studentId) return 'studentRequired';
  if (!input.sessionId) return 'sessionRequired';
  const filled = input.items.filter((i) => i.description.trim());
  if (filled.length === 0) return 'itemsRequired';
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
    .filter((d) => !d.saved && d.description.trim())
    .map((d) => ({ type: d.type, description: d.description.trim(), recitationNumber: numberOf(d) }));

/** Edit: only what changed, each saved item with the version it was edited from (the web's rule). */
export function updateBody(program: WorkProgram, items: readonly DraftItem[], notes: string) {
  const changed: WorkItemPatch[] = items
    .filter((d): d is DraftItem & { saved: WorkItem } => Boolean(d.saved))
    .filter((d) => d.type !== d.saved.type || d.description.trim() !== d.saved.description || numberOf(d) !== d.saved.recitationNumber)
    .map((d) => ({ id: d.saved.id, version: d.saved.version, type: d.type, description: d.description.trim(), recitationNumber: numberOf(d) }));
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

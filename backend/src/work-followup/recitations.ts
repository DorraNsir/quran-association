/**
 * «متابعة العرضات» — each student's recitation history of each surah (simple model).
 *
 * The history of (student, surah) is every structured عرضة of that surah in the student's work
 * programs, in chronological order (session date and start time, then the order of planning). No
 * cycles, no target, no limit. Results (the item's own evaluation, the only source of truth):
 *   منجز (COMPLETED) · جزئي (PARTIAL) · غير منجز (NOT_COMPLETED) · ملغى (CANCELLED: recited, too
 *   many mistakes) — each one an attempt («performed»);  مؤجل (POSTPONED) — not an attempt.
 *
 * NUMBERING (numberSurah): numbers follow the chronological sequence. Walking the history:
 *   - a performed attempt shows its number and the next recitation is the following one;
 *   - a scheduled / awaiting one shows the next number and takes it (it is planned to happen);
 *   - a postponed one (or a cancelled session's unevaluated one) shows the next number WITHOUT
 *     taking it: the recitation that follows continues it, with the same number.
 * A PERFORMED attempt's number is definitive: stored once, never rewritten. Every other number is
 * provisional and rewritten by the server after each change (record ids untouched). A change
 * that would contradict a definitive number (a postponement, correction, session move… placing
 * a recitation before it, or removing one) is refused — never "repaired" by renumbering history.
 * Lock order, everywhere: the sessions concerned (lockSessionWork), then the students
 * (lockRecitations), then rows — so concurrent changes are serialized, never deadlocked.
 */
import { formatDateAr, fromDbDate } from '../common/dates.js';
import { conflict } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';

import { surahName } from '../memorization/surahs.js';
import { fromDbTime } from '../scheduling/time.js';

type Tx = Prisma.TransactionClient;

/** What an item is in its surah's history. */
export type RecitationEntry =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'NOT_COMPLETED'
  | 'CANCELLED'
  | 'POSTPONED'
  | 'PENDING'
  | 'SESSION_CANCELLED';

export function recitationEntry(
  status: WorkStatus,
  sessionStatus: SessionStatus,
): RecitationEntry {
  if (status === WorkStatus.NOT_EVALUATED)
    return sessionStatus === SessionStatus.CANCELLED
      ? 'SESSION_CANCELLED'
      : 'PENDING';
  return status;
}

/** Recitations done with a result (the «3 عرضات» count): منجز, جزئي, غير منجز, ملغى. */
export const isAttempt = (entry: RecitationEntry) =>
  entry === 'COMPLETED' ||
  entry === 'PARTIAL' ||
  entry === 'NOT_COMPLETED' ||
  entry === 'CANCELLED';

/** A structured عرضة of one whole surah: the items of the histories. */
export function trackedSurah(item: {
  type: WorkType;
  quranAssignmentKind: WorkAssignmentKind | null;
  quranFromSurah: number | null;
}): number | null {
  return item.type === WorkType.RECITATION &&
    item.quranAssignmentKind === WorkAssignmentKind.SURAH_RANGE &&
    item.quranFromSurah
    ? item.quranFromSurah
    : null;
}

/** The where clause of one student's recitations (of some surahs). */
export const recitationsOf = (
  studentIds: string[],
  surahs?: number[],
): Prisma.WorkItemWhereInput => ({
  program: { studentId: { in: studentIds } },
  type: WorkType.RECITATION,
  quranAssignmentKind: WorkAssignmentKind.SURAH_RANGE,
  ...(surahs ? { quranFromSurah: { in: surahs } } : {}),
});

/**
 * Serializes the work planned in these sessions with any change of the sessions themselves (a
 * move, a cancellation): taken FIRST — before the students' locks (lockRecitations) and any row.
 */
export async function lockSessionWork(tx: Tx, sessionIds: string[]) {
  for (const id of [...new Set(sessionIds)].sort())
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`session-work:${id}`}, 0))) AS l`;
}

/**
 * Serializes every change of these students' recitation histories (transaction-scoped). Taken
 * FIRST in a transaction — before any work row is locked or written — always in the same order.
 */
export async function lockRecitations(tx: Tx, studentIds: string[]) {
  for (const id of [...new Set(studentIds)].sort())
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`recitations:${id}`}, 0))) AS l`;
}

/** "YYYY-MM-DDTHH:mm" of a session's start. */
export const sessionStart = (date: Date, startTime: Date) =>
  `${fromDbDate(date)}T${fromDbTime(startTime)}`;

/** One recitation of a (student, surah) history, as the numbering needs it. */
export interface HistoryRow {
  id: string;
  status: WorkStatus;
  sessionStatus: SessionStatus;
  /** "YYYY-MM-DDTHH:mm" */
  start: string;
  createdAt: Date;
  /** the stored number (definitive for a performed attempt) */
  stored: number | null;
}

/** The chronological order of a history: session start, then the order of planning. */
export const chronological = <
  R extends Pick<HistoryRow, 'id' | 'start' | 'createdAt'>,
>(
  rows: R[],
) =>
  [...rows].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );

export interface SurahNumbering {
  /** each recitation's number (what teachers see) */
  numbers: Map<string, number>;
  /** performed attempts whose definitive number contradicts their place → the number expected there */
  contradictions: Map<string, number>;
  /** the number of the next recitation planned after the last one */
  next: number;
}

/**
 * Numbers one (student, surah) history. `settling`: attempts performed in this very change —
 * they take the number of their place (it becomes definitive); other performed attempts keep
 * their stored number (a legacy one without a number takes its place's).
 */
export function numberSurah(
  rows: HistoryRow[],
  settling: ReadonlySet<string> = new Set(),
): SurahNumbering {
  const numbers = new Map<string, number>();
  const contradictions = new Map<string, number>();
  let n = 1;
  for (const r of chronological(rows)) {
    const entry = recitationEntry(r.status, r.sessionStatus);
    if (isAttempt(entry)) {
      if (r.stored !== null && !settling.has(r.id)) {
        numbers.set(r.id, r.stored);
        if (r.stored !== n) contradictions.set(r.id, n);
        n = Math.max(n, r.stored) + 1;
      } else numbers.set(r.id, n++);
    } else if (entry === 'POSTPONED' || entry === 'SESSION_CANCELLED')
      numbers.set(r.id, n); // continued by the next one: no number consumed
    else numbers.set(r.id, n++); // scheduled / awaiting its evaluation
  }
  return { numbers, contradictions, next: n };
}

/** «3 ديسمبر 2026 على الساعة 17:00» */
export const startAr = (start: string) =>
  `${formatDateAr(start.slice(0, 10))} على الساعة ${start.slice(11, 16)}`;

/** A change contradicting a performed recitation's number (409 + an Arabic explanation). */
export function recitationContradiction(
  code: string,
  lead: string,
  c: { number: number; surah: number; start: string; student?: string },
) {
  const who = c.student ? ` للطالب ${c.student}` : '';
  return conflict(
    code,
    `${lead}: العرضة ${c.number} من سورة ${surahName(c.surah) ?? c.surah}${who} (${startAr(c.start)}) أُدِّيت وقُيِّمت، وهذا التغيير يجعل ترقيم عرضات السورة غير صحيح. لا تتغيّر أرقام العرضات التي أُدِّيت`,
  );
}

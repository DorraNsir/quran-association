/**
 * «متابعة العرضات» — each student's recitation history of each surah (simple model).
 *
 * The history of (student, surah) is every structured عرضة of that surah in the student's work
 * programs, in chronological order. No cycles, no target, no limit. Results (the item's own
 * evaluation, the only source of truth):
 *   منجز (COMPLETED) · جزئي (PARTIAL) · غير منجز (NOT_COMPLETED) · ملغى (CANCELLED: recited, too
 *   many mistakes) — each one an attempt;  مؤجل (POSTPONED) — not an attempt («لا تحتسب»).
 *
 * Numbers are STORED on the items (recitationNumber), assigned by the server once and never
 * shifted afterwards:
 *   - a new recitation gets the surah's highest number + 1;
 *   - a postponed recitation rescheduled («نقل إلى الحصة القادمة») keeps its number — as does an
 *     unevaluated one carried out of a cancelled session (it did not take place either).
 * Every change of a surah's numbers happens under a per-(student, surah) lock.
 *
 * CHRONOLOGY (mandatory): in a (student, surah) history, a lower number takes place STRICTLY
 * before a higher one — by the session's actual date AND start time. Entries sharing a number (a
 * postponed recitation and its rescheduled continuation: one recitation, no number consumed by
 * the postponement) are not compared with each other — the continuation is always later anyway.
 * Checked under the same lock on every write that places a numbered recitation: creation,
 * «نقل إلى الحصة القادمة», «إضافة العرضة التالية», an item moved into another surah, and a session
 * moved to another date / time. Existing records are never reordered or renumbered: a write is
 * refused instead (only conflicts involving the written item count — an old inconsistency
 * elsewhere never blocks unrelated work; see scripts/audit-recitation-order.sql).
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
type Db = Pick<Tx, 'workItem'>;

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

/**
 * Does a carried copy keep its source's number? Yes for a recitation that did not take place:
 * postponed, or unevaluated (a cancelled session's work); otherwise it is a new recitation.
 */
export const keepsNumber = (carriedFromStatus: WorkStatus | null) =>
  carriedFromStatus === WorkStatus.POSTPONED ||
  carriedFromStatus === WorkStatus.NOT_EVALUATED;

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

/** Serializes every numbering of one student's recitations of one surah (transaction-scoped). */
export async function lockSurah(tx: Tx, studentId: string, surah: number) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`recitation:${studentId}:${surah}`}, 0))) AS l`;
}

/** The next number of a surah: its highest one + 1 (call under lockSurah). */
export async function nextRecitationNumber(
  tx: Tx,
  studentId: string,
  surah: number,
  exceptItemId: string,
): Promise<number> {
  const { _max } = await tx.workItem.aggregate({
    where: {
      ...recitationsOf([studentId], [surah]),
      id: { not: exceptItemId },
    },
    _max: { recitationNumber: true },
  });
  return (_max.recitationNumber ?? 0) + 1;
}

// ───────────────────────── chronology ─────────────────────────

/** A numbered recitation of one (student, surah): its session and that session's start ("YYYY-MM-DDTHH:mm"). */
export interface NumberedRecitation {
  id: string;
  number: number;
  sessionId: string;
  start: string;
}

export const sessionStart = (date: Date, startTime: Date) =>
  `${fromDbDate(date)}T${fromDbTime(startTime)}`;

/** The numbered recitations of one surah of one student (call under lockSurah when writing). */
export async function numberedRecitations(
  db: Db,
  studentId: string,
  surah: number,
): Promise<NumberedRecitation[]> {
  const rows = await db.workItem.findMany({
    where: {
      ...recitationsOf([studentId], [surah]),
      recitationNumber: { not: null },
    },
    select: {
      id: true,
      recitationNumber: true,
      program: {
        select: {
          session: { select: { id: true, date: true, startTime: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.recitationNumber as number,
    sessionId: r.program.session.id,
    start: sessionStart(r.program.session.date, r.program.session.startTime),
  }));
}

/** Why a recitation is out of order: it must come after (a lower number) or before (a higher one) `other`. */
export interface OrderConflict {
  other: NumberedRecitation;
  must: 'after' | 'before';
}

/**
 * The conflict of ONE recitation with the rest of its surah, if any: a lower number not strictly
 * earlier (the latest such one), else a higher number not strictly later (the earliest such one).
 */
export function orderConflict(
  item: Pick<NumberedRecitation, 'id' | 'number' | 'start'>,
  others: NumberedRecitation[],
): OrderConflict | null {
  let after: NumberedRecitation | null = null;
  let before: NumberedRecitation | null = null;
  for (const o of others) {
    if (o.id === item.id) continue;
    if (
      o.number < item.number &&
      o.start >= item.start &&
      (!after || o.start > after.start)
    )
      after = o;
    if (
      o.number > item.number &&
      o.start <= item.start &&
      (!before || o.start < before.start)
    )
      before = o;
  }
  if (after) return { other: after, must: 'after' };
  if (before) return { other: before, must: 'before' };
  return null;
}

/**
 * Where recitation `number` may take place (strict bounds, "YYYY-MM-DDTHH:mm"): after every lower
 * number, before every higher one. A NEW number (the highest + 1) only has a lower bound.
 */
export function recitationWindow(
  number: number,
  others: NumberedRecitation[],
): { after: string | null; before: string | null } {
  let after: string | null = null;
  let before: string | null = null;
  for (const o of others) {
    if (o.number < number && (after === null || o.start > after))
      after = o.start;
    if (o.number > number && (before === null || o.start < before))
      before = o.start;
  }
  return { after, before };
}

/** «3 ديسمبر 2026 على الساعة 17:00» */
export const startAr = (start: string) =>
  `${formatDateAr(start.slice(0, 10))} على الساعة ${start.slice(11, 16)}`;

/** The Arabic sentence of a conflict: «العرضة 3 من سورة المجادلة يجب أن تكون بعد العرضة 2 (…)». */
export function orderConflictMessage(
  number: number,
  surah: number,
  conflict: OrderConflict,
) {
  const which = `العرضة ${number} من سورة ${surahName(surah) ?? surah}`;
  const other = `العرضة ${conflict.other.number} (${startAr(conflict.other.start)})`;
  return conflict.must === 'after'
    ? `${which} يجب أن تكون بعد ${other}`
    : `${which} يجب أن تسبق ${other}`;
}

/** 409 WORK_RECITATION_ORDER: the recitation would break its surah's chronology. */
export const recitationOutOfOrder = (
  number: number,
  surah: number,
  clash: OrderConflict,
) =>
  conflict(
    'WORK_RECITATION_ORDER',
    `${orderConflictMessage(number, surah, clash)}: ${clash.must === 'after' ? 'اختر حصة بعدها' : 'اختر حصة قبلها'}`,
  );

/**
 * A session moved to `newStart` ("YYYY-MM-DDTHH:mm"): every numbered whole-surah recitation planned
 * in it must keep its surah's chronology at the new time — otherwise 409 SESSION_RECITATION_ORDER
 * (nothing is renumbered). Locks each (student, surah) in a fixed order, like numberRecitations.
 */
export async function assertSessionMoveKeepsRecitationOrder(
  tx: Tx,
  sessionId: string,
  newStart: string,
) {
  const items = await tx.workItem.findMany({
    where: {
      program: { sessionId },
      type: WorkType.RECITATION,
      quranAssignmentKind: WorkAssignmentKind.SURAH_RANGE,
      quranFromSurah: { not: null },
      recitationNumber: { not: null },
    },
    select: {
      id: true,
      recitationNumber: true,
      quranFromSurah: true,
      program: {
        select: {
          studentId: true,
          student: {
            select: { person: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });
  if (!items.length) return;
  const key = (i: (typeof items)[number]) =>
    `${i.program.studentId}:${String(i.quranFromSurah).padStart(3, '0')}`;
  const sorted = [...items].sort((a, b) => key(a).localeCompare(key(b)));
  for (const k of [...new Set(sorted.map(key))]) {
    const [studentId, surah] = k.split(':');
    await lockSurah(tx, studentId, Number(surah));
  }
  for (const item of sorted) {
    const surah = item.quranFromSurah as number;
    const number = item.recitationNumber as number;
    const rows = (
      await numberedRecitations(tx, item.program.studentId, surah)
    ).map((r) => (r.sessionId === sessionId ? { ...r, start: newStart } : r));
    const placed = rows.find((r) => r.id === item.id);
    const clash = placed ? orderConflict(placed, rows) : null;
    if (clash) {
      const { firstName, lastName } = item.program.student.person;
      throw conflict(
        'SESSION_RECITATION_ORDER',
        `لا يمكن نقل الحصة إلى هذا الموعد: ${orderConflictMessage(number, surah, clash)} للطالب ${firstName} ${lastName}. اختر موعدًا آخر`,
      );
    }
  }
}

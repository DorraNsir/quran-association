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
 */
import { Prisma } from '../generated/prisma/client.js';
import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';

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

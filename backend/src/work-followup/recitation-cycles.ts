/**
 * «متابعة العرضات» — recitation cycles of Work Program 2.0 (Phase 4).
 *
 * A cycle belongs to one student and one surah and is complete after FOUR successful recitations.
 * Its attempts are the work items (type عرضة, one whole surah) linked to it: their evaluation is
 * the only source of truth — nothing here copies a result. Everything below is derived from the
 * linked items, and every write that can change a cycle re-checks its rules in the SAME
 * transaction, under a per-(student, surah) lock, before committing:
 *
 *   R1  at most 4 successful recitations;
 *   R2  at most one recitation waiting for its evaluation;
 *   R3  once 4 recitations succeeded, none may be waiting (the cycle takes no further attempt);
 *   R4  a cycle followed by a newer one stays complete (its four successes cannot be undone).
 *
 * What an item is for its cycle:
 *   COMPLETED                       → successful attempt (counts);
 *   NOT_COMPLETED / PARTIAL         → unsuccessful attempt (an attempt, not counted);
 *   NOT_EVALUATED                   → pending attempt (an attempt, not counted);
 *   NOT_EVALUATED, session cancelled → not an attempt (the session did not take place);
 *   POSTPONED / CANCELLED (dropped)  → not an attempt (kept and shown in the history, unnumbered).
 * Attempt numbers are chronological (session date and time, then creation) within the cycle.
 */
import { ConflictException } from '@nestjs/common';

import { fromDbDate } from '../common/dates.js';
import { badRequest } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import { fromDbTime } from '../scheduling/time.js';

type Tx = Prisma.TransactionClient;

/** 409 with the cycle concerned (clients can offer to open its history). */
const cycleConflict = (
  code: string,
  message: string,
  details: { cycleId: string; surah: number },
) => new ConflictException({ code, message, ...details });

/** Successful recitations needed to complete a cycle. */
export const SUCCESSES_REQUIRED = 4;

export type CycleEntryKind =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'POSTPONED'
  | 'DROPPED'
  | 'SESSION_CANCELLED';

/** What a linked item is for its cycle (see the module comment). */
export function entryKind(
  status: WorkStatus,
  sessionStatus: SessionStatus,
): CycleEntryKind {
  if (status === WorkStatus.NOT_EVALUATED)
    return sessionStatus === SessionStatus.CANCELLED
      ? 'SESSION_CANCELLED'
      : 'PENDING';
  if (status === WorkStatus.COMPLETED) return 'SUCCESS';
  if (status === WorkStatus.NOT_COMPLETED || status === WorkStatus.PARTIAL)
    return 'FAILED';
  if (status === WorkStatus.POSTPONED) return 'POSTPONED';
  return 'DROPPED';
}

export interface CycleEntryInput {
  itemId: string;
  status: WorkStatus;
  sessionStatus: SessionStatus;
  /** "YYYY-MM-DD" and "HH:mm" of the item's session */
  sessionDate: string;
  sessionTime: string;
  createdAt: Date;
}

export interface CycleEntry extends CycleEntryInput {
  kind: CycleEntryKind;
  /** Chronological number among the attempts (null: not an attempt) */
  attemptNumber: number | null;
}

export interface CycleState {
  entries: CycleEntry[];
  attempts: number;
  successes: number;
  pending: number;
  failed: number;
  /** The attempt whose success completed the cycle (the 4th success), if any */
  completedByItemId: string | null;
}

/** Pure: the state of one cycle from its linked items (any order). */
export function cycleState(items: CycleEntryInput[]): CycleState {
  const sorted = [...items].sort(
    (a, b) =>
      a.sessionDate.localeCompare(b.sessionDate) ||
      a.sessionTime.localeCompare(b.sessionTime) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.itemId.localeCompare(b.itemId),
  );
  let attempts = 0;
  let successes = 0;
  let pending = 0;
  let failed = 0;
  let completedByItemId: string | null = null;
  const entries = sorted.map((i): CycleEntry => {
    const kind = entryKind(i.status, i.sessionStatus);
    const attempt =
      kind === 'SUCCESS' || kind === 'FAILED' || kind === 'PENDING';
    if (attempt) attempts++;
    if (kind === 'SUCCESS') {
      successes++;
      if (successes === SUCCESSES_REQUIRED) completedByItemId = i.itemId;
    }
    if (kind === 'PENDING') pending++;
    if (kind === 'FAILED') failed++;
    return { ...i, kind, attemptNumber: attempt ? attempts : null };
  });
  return { entries, attempts, successes, pending, failed, completedByItemId };
}

/** Why a change breaks a cycle rule, or null. `context`: what the caller is doing. */
export function cycleViolation(
  state: Pick<CycleState, 'successes' | 'pending'>,
  hasNewerCycle: boolean,
  context: 'attempt' | 'evaluation',
): { code: string; message: string } | null {
  if (state.successes > SUCCESSES_REQUIRED)
    return {
      code: 'RECITATION_CYCLE_COMPLETED',
      message:
        'اكتملت هذه الدورة بأربع عرضات ناجحة: لا تُحتسب عرضة ناجحة إضافية فيها',
    };
  if (hasNewerCycle && state.successes < SUCCESSES_REQUIRED)
    return {
      code: 'RECITATION_CYCLE_CLOSED',
      message:
        'بدأت دورة جديدة لهذه السورة: لا يمكن تعديل نتيجة تُلغي اكتمال الدورة السابقة',
    };
  if (state.successes === SUCCESSES_REQUIRED && state.pending > 0)
    return context === 'attempt'
      ? {
          code: 'RECITATION_CYCLE_COMPLETED',
          message:
            'اكتملت دورة هذه السورة (4 عرضات ناجحة): ابدأ دورة جديدة لإضافة عرضة',
        }
      : {
          code: 'RECITATION_ATTEMPT_PENDING',
          message:
            'لهذه السورة عرضة لم تُقيَّم بعد: قيِّمها أو ألغها قبل إكمال الدورة',
        };
  if (state.pending > 1)
    return {
      code: 'RECITATION_ATTEMPT_PENDING',
      message:
        'لهذه السورة عرضة لم تُقيَّم بعد: لا تُضاف عرضة أخرى قبل تقييمها',
    };
  return null;
}

/** A structured عرضة of one whole surah: the only items tracked by cycles. */
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

/** Serializes every change to one student's cycles of one surah (transaction-scoped). */
export async function lockSurah(tx: Tx, studentId: string, surah: number) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`recitation:${studentId}:${surah}`}, 0))) AS l`;
}

const ENTRY_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  recitationCycleId: true,
  program: {
    select: {
      session: { select: { date: true, startTime: true, status: true } },
    },
  },
} satisfies Prisma.WorkItemSelect;

type EntryRow = Prisma.WorkItemGetPayload<{ select: typeof ENTRY_SELECT }>;

const toInput = (r: EntryRow): CycleEntryInput => ({
  itemId: r.id,
  status: r.status,
  sessionStatus: r.program.session.status,
  sessionDate: fromDbDate(r.program.session.date),
  sessionTime: fromDbTime(r.program.session.startTime),
  createdAt: r.createdAt,
});

/** The current state of several cycles (one query). */
export async function statesOf(
  db: Pick<Tx, 'workItem'>,
  cycleIds: string[],
): Promise<Map<string, CycleState>> {
  const rows = cycleIds.length
    ? await db.workItem.findMany({
        where: { recitationCycleId: { in: cycleIds } },
        select: ENTRY_SELECT,
      })
    : [];
  const by = new Map<string, CycleEntryInput[]>(cycleIds.map((id) => [id, []]));
  for (const r of rows) by.get(r.recitationCycleId as string)?.push(toInput(r));
  return new Map([...by].map(([id, items]) => [id, cycleState(items)]));
}

/**
 * The cycle a NEW attempt of (student, surah) joins: the latest one (created as cycle 1 when the
 * student has none for this surah). Call under lockSurah. A complete latest cycle is refused:
 * a new cycle is only started explicitly.
 */
export async function cycleForNewAttempt(
  tx: Tx,
  studentId: string,
  surah: number,
  userId: string,
) {
  const latest =
    (await tx.recitationCycle.findFirst({
      where: { studentId, surah },
      orderBy: { number: 'desc' },
      select: { id: true, number: true },
    })) ??
    (await tx.recitationCycle.create({
      data: { studentId, surah, number: 1, startedByUserId: userId },
      select: { id: true, number: true },
    }));
  return latest;
}

/**
 * Re-checks the rules of the given cycles after a write (same transaction) and keeps their
 * `completedAt` in step; throws (→ rollback) when a rule is broken.
 */
export async function verifyCycles(
  tx: Tx,
  cycleIds: string[],
  context: 'attempt' | 'evaluation',
) {
  const ids = [...new Set(cycleIds)];
  if (!ids.length) return;
  const cycles = await tx.recitationCycle.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      studentId: true,
      surah: true,
      number: true,
      completedAt: true,
    },
  });
  const states = await statesOf(tx, ids);
  for (const c of cycles) {
    const state = states.get(c.id) as CycleState;
    const newer = await tx.recitationCycle.count({
      where: {
        studentId: c.studentId,
        surah: c.surah,
        number: { gt: c.number },
      },
    });
    const violation = cycleViolation(state, newer > 0, context);
    if (violation)
      throw cycleConflict(violation.code, violation.message, {
        cycleId: c.id,
        surah: c.surah,
      });
    const complete = state.successes === SUCCESSES_REQUIRED;
    if (complete !== (c.completedAt !== null))
      await tx.recitationCycle.update({
        where: { id: c.id },
        data: { completedAt: complete ? new Date() : null },
      });
  }
}

/** «بدء دورة جديدة»: only after the latest cycle of this surah is complete. Call under lockSurah. */
export async function startCycle(
  tx: Tx,
  studentId: string,
  surah: number,
  userId: string,
) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114)
    throw badRequest('RECITATION_SURAH_INVALID', 'رقم سورة غير صحيح');
  const latest = await tx.recitationCycle.findFirst({
    where: { studentId, surah },
    orderBy: { number: 'desc' },
    select: { id: true, number: true },
  });
  if (latest) {
    const state = (await statesOf(tx, [latest.id])).get(
      latest.id,
    ) as CycleState;
    if (state.successes < SUCCESSES_REQUIRED)
      throw cycleConflict(
        'RECITATION_CYCLE_NOT_COMPLETED',
        'لا تبدأ دورة جديدة قبل اكتمال الدورة الحالية بأربع عرضات ناجحة',
        { cycleId: latest.id, surah },
      );
  }
  return tx.recitationCycle.create({
    data: {
      studentId,
      surah,
      number: (latest?.number ?? 0) + 1,
      startedByUserId: userId,
    },
    select: { id: true, number: true },
  });
}

import { SessionStatus, WorkStatus } from '../generated/prisma/enums.js';
import {
  cycleState,
  cycleViolation,
  entryKind,
  SUCCESSES_REQUIRED,
  type CycleEntryInput,
} from './recitation-cycles.js';

const S = WorkStatus;
let n = 0;
const at = (
  status: WorkStatus,
  day: number,
  sessionStatus: SessionStatus = SessionStatus.COMPLETED,
): CycleEntryInput => ({
  itemId: `i${++n}`,
  status,
  sessionStatus,
  sessionDate: `2026-11-${String(day).padStart(2, '0')}`,
  sessionTime: '16:00',
  createdAt: new Date(`2026-11-01T00:00:${String(n % 60).padStart(2, '0')}Z`),
});

describe('recitation cycles (pure rules)', () => {
  it('what each result is: success, failure, pending; postponed, dropped and cancelled-session items are not attempts', () => {
    expect(entryKind(S.COMPLETED, SessionStatus.COMPLETED)).toBe('SUCCESS');
    expect(entryKind(S.NOT_COMPLETED, SessionStatus.COMPLETED)).toBe('FAILED');
    expect(entryKind(S.PARTIAL, SessionStatus.COMPLETED)).toBe('FAILED');
    expect(entryKind(S.NOT_EVALUATED, SessionStatus.SCHEDULED)).toBe('PENDING');
    expect(entryKind(S.NOT_EVALUATED, SessionStatus.CANCELLED)).toBe(
      'SESSION_CANCELLED',
    );
    expect(entryKind(S.POSTPONED, SessionStatus.COMPLETED)).toBe('POSTPONED');
    expect(entryKind(S.CANCELLED, SessionStatus.COMPLETED)).toBe('DROPPED');
  });

  it('S, S, F, S, pending → 3/4 with five numbered attempts; the pending one succeeding completes the cycle on attempt 5', () => {
    const items = [
      at(S.COMPLETED, 1),
      at(S.COMPLETED, 2),
      at(S.NOT_COMPLETED, 3),
      at(S.COMPLETED, 4),
      at(S.NOT_EVALUATED, 5, SessionStatus.SCHEDULED),
    ];
    const st = cycleState(items);
    expect([st.successes, st.attempts, st.pending, st.failed]).toEqual([
      3, 5, 1, 1,
    ]);
    expect(st.entries.map((e) => e.attemptNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(st.completedByItemId).toBeNull();
    const done = cycleState([
      ...items.slice(0, 4),
      { ...items[4]!, status: S.COMPLETED },
    ]);
    expect(done.successes).toBe(SUCCESSES_REQUIRED);
    expect(done.completedByItemId).toBe(items[4]!.itemId);
  });

  it('chronological numbering whatever the input order; non-attempts are unnumbered and do not shift the count', () => {
    const items = [
      at(S.COMPLETED, 9),
      at(S.POSTPONED, 2),
      at(S.NOT_COMPLETED, 5),
      at(S.NOT_EVALUATED, 3, SessionStatus.CANCELLED),
    ];
    const st = cycleState(items);
    expect(
      st.entries.map((e) => [e.sessionDate.slice(-2), e.kind, e.attemptNumber]),
    ).toEqual([
      ['02', 'POSTPONED', null],
      ['03', 'SESSION_CANCELLED', null],
      ['05', 'FAILED', 1],
      ['09', 'SUCCESS', 2],
    ]);
  });

  it('rules: 4 successes at most; one pending attempt; none once complete; a closed cycle stays complete', () => {
    const v = (
      successes: number,
      pending: number,
      newer = false,
      context: 'attempt' | 'evaluation' = 'attempt',
    ) => cycleViolation({ successes, pending }, newer, context)?.code ?? null;
    expect(v(3, 1)).toBeNull();
    expect(v(4, 0)).toBeNull();
    expect(v(5, 0)).toBe('RECITATION_CYCLE_COMPLETED');
    expect(v(2, 2)).toBe('RECITATION_ATTEMPT_PENDING');
    expect(v(4, 1, false, 'attempt')).toBe('RECITATION_CYCLE_COMPLETED'); // a new attempt after completion
    expect(v(4, 1, false, 'evaluation')).toBe('RECITATION_ATTEMPT_PENDING'); // a correction completing it early
    expect(v(3, 0, true)).toBe('RECITATION_CYCLE_CLOSED');
    expect(v(4, 0, true)).toBeNull();
  });
});

import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import {
  isAttempt,
  keepsNumber,
  orderConflict,
  orderConflictMessage,
  recitationEntry,
  recitationWindow,
  trackedSurah,
  type NumberedRecitation,
} from './recitations.js';

describe('«متابعة العرضات» (simple model): pure rules', () => {
  it('results: منجز, جزئي, غير منجز and ملغى are recitations done; مؤجل is not; a pending one not yet', () => {
    const done = (s: WorkStatus) =>
      isAttempt(recitationEntry(s, SessionStatus.COMPLETED));
    expect(
      [
        WorkStatus.COMPLETED,
        WorkStatus.PARTIAL,
        WorkStatus.NOT_COMPLETED,
        WorkStatus.CANCELLED,
      ].map(done),
    ).toEqual([true, true, true, true]);
    expect(done(WorkStatus.POSTPONED)).toBe(false);
    expect(
      recitationEntry(WorkStatus.NOT_EVALUATED, SessionStatus.SCHEDULED),
    ).toBe('PENDING');
    expect(
      recitationEntry(WorkStatus.NOT_EVALUATED, SessionStatus.CANCELLED),
    ).toBe('SESSION_CANCELLED');
    expect(isAttempt('PENDING')).toBe(false);
  });

  it('a carried copy keeps its number only when the recitation did not take place (postponed / cancelled session)', () => {
    expect(keepsNumber(WorkStatus.POSTPONED)).toBe(true);
    expect(keepsNumber(WorkStatus.NOT_EVALUATED)).toBe(true);
    for (const s of [
      WorkStatus.NOT_COMPLETED,
      WorkStatus.PARTIAL,
      WorkStatus.CANCELLED,
      WorkStatus.COMPLETED,
      null,
    ])
      expect(keepsNumber(s)).toBe(false);
  });

  it('only a structured عرضة of one surah has a history', () => {
    const item = (
      type: WorkType,
      kind: WorkAssignmentKind | null,
      surah: number | null,
    ) => ({ type, quranAssignmentKind: kind, quranFromSurah: surah });
    expect(
      trackedSurah(
        item(WorkType.RECITATION, WorkAssignmentKind.SURAH_RANGE, 58),
      ),
    ).toBe(58);
    expect(trackedSurah(item(WorkType.RECITATION, null, null))).toBeNull(); // free text
    expect(
      trackedSurah(item(WorkType.REVISION, WorkAssignmentKind.SURAH_RANGE, 58)),
    ).toBeNull();
  });
});

describe('«متابعة العرضات»: chronology (pure)', () => {
  const r = (
    id: string,
    number: number,
    start: string,
  ): NumberedRecitation => ({
    id,
    number,
    sessionId: `s-${id}`,
    start,
  });
  const history = [
    r('a', 1, '2026-11-02T16:00'),
    r('b', 2, '2026-11-09T16:00'), // postponed
    r('c', 2, '2026-11-16T16:00'), // its continuation: same number, never compared
    r('d', 3, '2026-11-23T16:00'),
  ];

  it('a consistent history has no conflict; same-number entries are one recitation', () => {
    for (const x of history) expect(orderConflict(x, history)).toBeNull();
  });

  it('backdating: the latest lower number not strictly earlier; time counts, not only the date', () => {
    expect(orderConflict(r('n', 4, '2026-11-20T16:00'), history)).toEqual({
      other: history[3],
      must: 'after',
    });
    // the same day: earlier refused, the same minute refused, later accepted
    expect(orderConflict(r('n', 4, '2026-11-23T15:00'), history)?.must).toBe(
      'after',
    );
    expect(orderConflict(r('n', 4, '2026-11-23T16:00'), history)?.must).toBe(
      'after',
    );
    expect(orderConflict(r('n', 4, '2026-11-23T17:00'), history)).toBeNull();
  });

  it('a recitation moved past the next number: the earliest higher one', () => {
    expect(orderConflict(r('c', 2, '2026-11-30T16:00'), history)).toEqual({
      other: history[3],
      must: 'before',
    });
  });

  it('windows: a kept number between its neighbours; a new number after all', () => {
    expect(recitationWindow(2, history)).toEqual({
      after: '2026-11-02T16:00',
      before: '2026-11-23T16:00',
    });
    expect(recitationWindow(4, history)).toEqual({
      after: '2026-11-23T16:00',
      before: null,
    });
    expect(recitationWindow(1, [])).toEqual({ after: null, before: null });
  });

  it('the Arabic message names the surah, both numbers and the date / time', () => {
    const clash = orderConflict(r('n', 4, '2026-11-20T16:00'), history)!;
    expect(orderConflictMessage(4, 58, clash)).toMatch(
      /^العرضة 4 من سورة المجادلة يجب أن تكون بعد العرضة 3 \(23 .+ 2026 على الساعة 16:00\)$/,
    );
  });
});

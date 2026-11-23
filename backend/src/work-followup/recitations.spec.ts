import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import {
  isAttempt,
  chronological,
  numberSurah,
  recitationEntry,
  trackedSurah,
  type HistoryRow,
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

describe('«متابعة العرضات»: chronological numbering (numberSurah, pure)', () => {
  let t = 0;
  const row = (
    id: string,
    status: WorkStatus,
    start: string,
    stored: number | null = null,
    sessionStatus: SessionStatus = SessionStatus.SCHEDULED,
  ): HistoryRow => ({
    id,
    status,
    sessionStatus,
    start,
    createdAt: new Date(2026, 0, 1, 0, 0, t++),
    stored,
  });
  const {
    NOT_EVALUATED: PLANNED,
    POSTPONED,
    COMPLETED,
    PARTIAL,
    NOT_COMPLETED,
    CANCELLED,
  } = WorkStatus;
  const shown = (rows: HistoryRow[], settling?: Set<string>) => {
    const { numbers } = numberSurah(rows, settling);
    return chronological(rows).map((r) => [r.id, numbers.get(r.id)]);
  };

  it('three planned recitations: 1, 2, 3 (by session date AND time, whatever the order of planning)', () => {
    const rows = [
      row('c', PLANNED, '2026-12-03T16:00'),
      row('a', PLANNED, '2026-11-26T16:00'),
      row('b', PLANNED, '2026-11-28T16:00'),
    ];
    expect(shown(rows)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(numberSurah(rows).next).toBe(4);
    // the same day: the time decides
    expect(
      shown([
        row('x', PLANNED, '2026-11-26T18:00'),
        row('y', PLANNED, '2026-11-26T09:00'),
      ]),
    ).toEqual([
      ['y', 1],
      ['x', 2],
    ]);
  });

  it('a postponement takes no number: 1 مؤجل · 1 · 2 — repeated, still the same number', () => {
    expect(
      shown([
        row('a', POSTPONED, '2026-11-26T16:00', 1),
        row('b', PLANNED, '2026-11-28T16:00', 2),
        row('c', PLANNED, '2026-12-03T16:00', 3),
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2],
    ]);
    expect(
      shown([
        row('a', POSTPONED, '2026-11-26T16:00'),
        row('b', POSTPONED, '2026-11-28T16:00'),
        row('c', PLANNED, '2026-12-03T16:00'),
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
    // a cancelled session's unevaluated recitation: the same (it did not take place)
    expect(
      shown([
        row('a', PLANNED, '2026-11-26T16:00', 1, SessionStatus.CANCELLED),
        row('b', PLANNED, '2026-11-28T16:00'),
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
  });

  it('every performed result takes a number: منجز, جزئي, غير منجز and ملغى (too many mistakes)', () => {
    expect(
      shown([
        row('a', CANCELLED, '2026-11-02T16:00', 1),
        row('b', NOT_COMPLETED, '2026-11-09T16:00', 2),
        row('c', PARTIAL, '2026-11-16T16:00', 3),
        row('d', COMPLETED, '2026-11-23T16:00', 4),
        row('e', PLANNED, '2026-11-30T16:00'),
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ]);
  });

  it('a performed number is definitive; a change contradicting it is detected (never renumbered)', () => {
    // 1 منجز, then 2 منجز: consistent
    const ok = [
      row('a', COMPLETED, '2026-11-02T16:00', 1),
      row('b', COMPLETED, '2026-11-09T16:00', 2),
    ];
    expect(numberSurah(ok).contradictions.size).toBe(0);
    // the first corrected into «مؤجل»: the second would become 1 — contradiction, its number kept
    const corrected = [
      row('a', POSTPONED, '2026-11-02T16:00', 1),
      row('b', COMPLETED, '2026-11-09T16:00', 2),
    ];
    const n = numberSurah(corrected);
    expect(n.numbers.get('b')).toBe(2);
    expect([...n.contradictions]).toEqual([['b', 1]]);
    // a planned recitation moved before a performed one: contradiction
    expect([
      ...numberSurah([
        row('p', PLANNED, '2026-11-01T16:00'),
        ...ok,
      ]).contradictions.keys(),
    ]).toEqual(['a', 'b']);
  });

  it('performed now (settling): it takes its place number, even over an outdated stored one', () => {
    const rows = [
      row('a', POSTPONED, '2026-11-02T16:00', 1),
      row('b', COMPLETED, '2026-11-09T16:00', 2),
    ];
    const n = numberSurah(rows, new Set(['b']));
    expect(n.numbers.get('b')).toBe(1);
    expect(n.contradictions.size).toBe(0);
    expect(n.next).toBe(2);
  });

  it('legacy data: a performed number out of sequence stays as it is; what follows continues from it', () => {
    expect(
      shown([
        row('a', COMPLETED, '2026-11-02T16:00', 5),
        row('b', PLANNED, '2026-11-09T16:00'),
      ]),
    ).toEqual([
      ['a', 5],
      ['b', 6],
    ]);
    expect(
      shown([
        row('a', COMPLETED, '2026-11-02T16:00', null),
        row('b', PLANNED, '2026-11-09T16:00'),
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import {
  isAttempt,
  keepsNumber,
  recitationEntry,
  trackedSurah,
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

import { ApiError } from '@/services/api';

import { classMemoFixture, memoStudent, recordFixture, YEAR_FIXTURE } from './__fixtures__/memorization';
import {
  memorizationRoster,
  platformDateOf,
  semesterEntry,
  semesterNotStarted,
  semesterPeriod,
} from './memorization-model';

describe('class memorization list (the web teacher page population)', () => {
  it('active students still in the class, by name; a left or inactive student is not listed', () => {
    const rows = memorizationRoster(
      classMemoFixture([
        memoStudent('b', 'يوسف', { lastMemorizedSurahNumber: 78, surahName: 'النبأ', updatedAt: '2026-11-10T09:00:00Z' }),
        memoStudent('a', 'آمنة'),
        memoStudent('c', 'سليم', { currentMember: false, lastMemorizedSurahNumber: 80, surahName: 'عبس' }),
        memoStudent('d', 'دعاء', { studentStatus: 'INACTIVE' }),
      ]),
    );
    expect(rows.map((r) => r.studentId)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ surahNumber: null, surahName: null, updatedAt: null }); // never invented
    expect(rows[1]).toMatchObject({ surahNumber: 78, surahName: 'النبأ' });
  });
});

describe('semesters and dates', () => {
  it("a semester's dates are the academic year's own ranges", () => {
    expect(semesterPeriod(YEAR_FIXTURE, 'FIRST')).toEqual({ from: '2026-09-15', to: '2027-01-31' });
    expect(semesterPeriod(YEAR_FIXTURE, 'SECOND')).toEqual({ from: '2027-02-01', to: '2027-06-30' });
  });

  it('a semester that starts after today has not started', () => {
    expect(semesterNotStarted(YEAR_FIXTURE, 'SECOND', '2026-11-16')).toBe(true);
    expect(semesterNotStarted(YEAR_FIXTURE, 'FIRST', '2026-11-16')).toBe(false);
  });

  it('an update time is shown on the PLATFORM day (Tunis), not UTC nor the phone', () => {
    expect(platformDateOf('2026-11-15T23:30:00Z', 'Africa/Tunis')).toBe('2026-11-16');
    expect(platformDateOf('2026-11-15T22:30:00Z', 'Africa/Tunis')).toBe('2026-11-15');
  });
});

describe('a student semester, from the server answer', () => {
  it('a record, null (not recorded yet), 403 (not my student then), other errors (no entry)', () => {
    const record = recordFixture('st1', 'FIRST', 78, 'النبأ', '2026-11-10T09:00:00Z');
    expect(semesterEntry('FIRST', record, null)).toEqual({ semester: 'FIRST', kind: 'recorded', record });
    expect(semesterEntry('SECOND', null, null)).toEqual({ semester: 'SECOND', kind: 'notRecorded' });
    expect(semesterEntry('FIRST', undefined, new ApiError(403, 'TEACHER_STUDENT_ACCESS_DENIED', 'x'))).toEqual({
      semester: 'FIRST',
      kind: 'notMine',
    });
    expect(semesterEntry('FIRST', undefined, new ApiError(500, 'HTTP_500', 'x'))).toBeNull();
    expect(semesterEntry('FIRST', undefined, null)).toBeNull(); // still loading
  });
});

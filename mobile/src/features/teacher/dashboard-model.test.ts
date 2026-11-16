import {
  activeStudentCount,
  currentSemester,
  memorizationProgress,
  platformClock,
  teacherClasses,
  weekdayOf,
} from './dashboard-model';
import { classMemoFixture, memoStudent } from './__fixtures__/memorization';
import { workspaceFixture } from './__fixtures__/workspace';
import type { ClassMemorization } from './types';

const workspace = workspaceFixture;

describe('teacherClasses', () => {
  const classes = teacherClasses(workspace());

  it('keeps only my classes (supervisor or assistant), with my role', () => {
    // Supervisor assignments first (the web's order), then by group name
    expect(classes.map((c) => [c.id, c.role])).toEqual([
      ['c1', 'SUPERVISOR'],
      ['c2', 'ASSISTANT'],
    ]);
  });

  it('resolves names and counts only ACTIVE students of each class', () => {
    const c1 = classes.find((c) => c.id === 'c1')!;
    expect(c1).toMatchObject({ groupName: 'مجموعة الفجر', branchName: 'الفرع الرئيسي', activeStudents: 2 });
    expect(classes.find((c) => c.id === 'c2')!.status).toBe('INACTIVE');
  });

  it('weekly slots: sorted by weekday then time; shared slots found through participants', () => {
    expect(classes.find((c) => c.id === 'c1')!.slots.map((s) => s.day)).toEqual(['MON', 'WED']);
    const c2 = classes.find((c) => c.id === 'c2')!;
    expect(c2.slots).toEqual([
      {
        id: 's3',
        day: 'SAT',
        start: '10:00',
        end: '12:00',
        roomName: 'قاعة 2',
        roomBranchName: null,
        shared: true,
        sharedWith: ['مجموعة أخرى'],
      },
    ]);
  });

  it('archived classes are never listed', () => {
    const ws = workspace();
    ws.groupClasses[0]!.status = 'ARCHIVED';
    expect(teacherClasses(ws).map((c) => c.id)).toEqual(['c2']);
  });

  it('activeStudentCount over a set of classes', () => {
    expect(activeStudentCount(workspace(), new Set(['c1', 'c2']))).toBe(3);
  });
});

describe('memorizationProgress', () => {
  it('counts current ACTIVE members, recorded = a surah is set for the semester', () => {
    const dto: ClassMemorization = classMemoFixture([
      memoStudent('a', 'أ', { lastMemorizedSurahNumber: 78, surahName: 'النبأ' }),
      memoStudent('b', 'ب'),
      memoStudent('c', 'ج', { currentMember: false, lastMemorizedSurahNumber: 80, surahName: 'عبس' }),
      memoStudent('d', 'د', { studentStatus: 'INACTIVE', lastMemorizedSurahNumber: 90, surahName: 'البلد' }),
    ]);
    expect(memorizationProgress(dto)).toEqual({
      groupClassId: 'c1',
      groupName: 'مجموعة الفجر',
      total: 2,
      recorded: 1,
    });
  });
});

describe('dates and formatting', () => {
  const year = {
    id: 'y', label: '2026-2027', startDate: '2026-09-15', endDate: '2027-06-30',
    firstSemester: { startDate: '2026-09-15', endDate: '2027-01-31' },
    secondSemester: { startDate: '2027-02-01', endDate: '2027-06-30' },
  };

  it('semester containing today, else the first (web defaultPeriod)', () => {
    // The API's values (Prisma enum Semester), sent as-is
    expect(currentSemester(year, '2026-11-16')).toBe('FIRST');
    expect(currentSemester(year, '2027-03-01')).toBe('SECOND');
    expect(currentSemester(year, '2027-08-01')).toBe('FIRST');
  });

  it('platform clock follows the platform timezone, not the device', () => {
    // 23:30 UTC on 15 Nov = 00:30 on 16 Nov in Tunis (UTC+1)
    const instant = new Date('2026-11-15T23:30:00Z');
    expect(platformClock('Africa/Tunis', instant)).toEqual({ today: '2026-11-16', time: '00:30' });
    expect(platformClock('UTC', instant)).toEqual({ today: '2026-11-15', time: '23:30' });
  });

  it('falls back to the device clock for an unknown timezone', () => {
    const clock = platformClock('Not/AZone', new Date());
    expect(clock.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('weekday of a calendar date (no timezone shift)', () => {
    expect(weekdayOf('2026-11-16')).toBe('MON');
    expect(weekdayOf('2026-11-15')).toBe('SUN');
  });
});

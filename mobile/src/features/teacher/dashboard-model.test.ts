import {
  activeStudentCount,
  currentSemester,
  memorizationProgress,
  platformClock,
  teacherClasses,
  upcomingSessions,
  weekdayOf,
} from './dashboard-model';
import { sessionFixture } from './__fixtures__/sessions';
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

const session = sessionFixture;

describe('upcomingSessions', () => {
  const clock = { today: '2026-11-16', time: '12:00' };

  it("drops today's lessons that have ended, keeps the running and later ones", () => {
    const list = upcomingSessions(
      [
        session('ended', '2026-11-16', '09:00', '11:00'),
        session('running', '2026-11-16', '11:30', '13:00'),
        session('later', '2026-11-18', '17:00', '19:00'),
      ],
      clock,
    );
    expect(list.map((s) => [s.id, s.isToday])).toEqual([
      ['running', true],
      ['later', false],
    ]);
  });

  it('never shows cancelled or completed sessions and respects the limit', () => {
    const list = upcomingSessions(
      [
        session('x', '2026-11-17', '09:00', '10:00', { status: 'CANCELLED' }),
        session('a', '2026-11-17', '10:00', '11:00'),
        session('b', '2026-11-18', '10:00', '11:00'),
        session('c', '2026-11-19', '10:00', '11:00'),
      ],
      clock,
      2,
    );
    expect(list.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('a shared lesson lists every participating group; extra lessons are flagged', () => {
    const [s] = upcomingSessions(
      [
        session('shared', '2026-11-17', '10:00', '11:00', {
          isExtra: true,
          additionalClasses: [
            { id: 'c2', status: 'ACTIVE', group: { id: 'g2', name: 'مجموعة الأمل', status: 'ACTIVE' } },
          ],
        }),
      ],
      clock,
    );
    expect(s).toMatchObject({ groupNames: ['مجموعة الفجر', 'مجموعة الأمل'], isExtra: true, roomName: 'قاعة 1' });
  });
});

describe('memorizationProgress', () => {
  it('counts current ACTIVE members, recorded = a surah is set for the semester', () => {
    const dto: ClassMemorization = {
      groupClass: { id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
      academicYear: { id: 'y', label: '2026-2027' },
      semester: 'SEMESTER_1',
      students: [
        { studentId: 'a', studentStatus: 'ACTIVE', currentMember: true, lastMemorizedSurahNumber: 78 },
        { studentId: 'b', studentStatus: 'ACTIVE', currentMember: true, lastMemorizedSurahNumber: null },
        { studentId: 'c', studentStatus: 'ACTIVE', currentMember: false, lastMemorizedSurahNumber: 80 },
        { studentId: 'd', studentStatus: 'INACTIVE', currentMember: true, lastMemorizedSurahNumber: 90 },
      ],
    };
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
    expect(currentSemester(year, '2026-11-16')).toBe('SEMESTER_1');
    expect(currentSemester(year, '2027-03-01')).toBe('SEMESTER_2');
    expect(currentSemester(year, '2027-08-01')).toBe('SEMESTER_1');
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

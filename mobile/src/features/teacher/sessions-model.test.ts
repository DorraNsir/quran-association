import { sessionFixture } from './__fixtures__/sessions';
import {
  addDays,
  combineQuery,
  DEFAULT_SESSION_TAB,
  groupByDay,
  myRoleIn,
  periodRange,
  sessionTeam,
  startOfWeek,
  tabQuery,
  toSessionItem,
} from './sessions-model';

const TODAY = '2026-11-18'; // a Wednesday
const clock = { today: TODAY, time: '12:00' };
const YEAR = {
  id: 'y',
  label: '2026-2027',
  startDate: '2026-09-15',
  endDate: '2027-06-30',
  firstSemester: { startDate: '2026-09-15', endDate: '2027-01-31' },
  secondSemester: { startDate: '2027-02-01', endDate: '2027-06-30' },
};

describe('status tabs = server queries', () => {
  it("the default view is TODAY (every status of the day); «القادمة» = SCHEDULED from today, no cancelled", () => {
    expect(DEFAULT_SESSION_TAB).toBe('today');
    expect(tabQuery('upcoming', TODAY)).toEqual({ from: TODAY, status: 'SCHEDULED', order: 'asc' });
  });

  it('«حضور غير مكتمل» = the web query: SCHEDULED up to today, latest first', () => {
    expect(tabQuery('pending', TODAY)).toEqual({ to: TODAY, status: 'SCHEDULED', order: 'desc' });
  });

  it('today = every status of today; done / cancelled = that status, latest first; all = no status', () => {
    expect(tabQuery('today', TODAY)).toEqual({ from: TODAY, to: TODAY, order: 'asc' });
    expect(tabQuery('done', TODAY)).toEqual({ status: 'COMPLETED', order: 'desc' });
    expect(tabQuery('cancelled', TODAY)).toEqual({ status: 'CANCELLED', order: 'desc' });
    expect(tabQuery('all', TODAY)).toEqual({ order: 'desc' });
  });
});

describe('periods (web presets, platform day)', () => {
  it('week = Monday → Sunday', () => {
    expect(startOfWeek(TODAY)).toBe('2026-11-16');
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // Sunday belongs to the same week
    expect(periodRange('week', TODAY, null)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('month = the calendar month, including February and year ends', () => {
    expect(periodRange('month', TODAY, null)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('month', '2027-02-10', null)).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(periodRange('month', '2026-12-31', null)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('year = the current academic year; none configured → no bound', () => {
    expect(periodRange('year', TODAY, YEAR)).toEqual({ from: '2026-09-15', to: '2027-06-30' });
    expect(periodRange('year', TODAY, null)).toEqual({});
    expect(periodRange('all', TODAY, YEAR)).toEqual({});
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('combining tab, period and class', () => {
  it('the tighter bound wins; the class becomes groupClassId', () => {
    expect(combineQuery(tabQuery('upcoming', TODAY), periodRange('week', TODAY, null), 'c1')).toEqual({
      from: TODAY,
      to: '2026-11-22',
      status: 'SCHEDULED',
      order: 'asc',
      groupClassId: 'c1',
    });
  });

  it('an empty intersection is null (nothing is requested)', () => {
    const pastYear = { ...YEAR, startDate: '2025-09-15', endDate: '2026-06-30' };
    expect(combineQuery(tabQuery('upcoming', TODAY), periodRange('year', TODAY, pastYear))).toBeNull();
  });

  it('no period, no class: the tab query as is', () => {
    expect(combineQuery(tabQuery('cancelled', TODAY), {})).toEqual({ status: 'CANCELLED', order: 'desc' });
  });
});

describe('session view model', () => {
  it("room and branch are THIS session's snapshot", () => {
    const item = toSessionItem(
      sessionFixture('s', TODAY, '17:00', '19:00', {
        room: { id: 'r9', name: 'قاعة 4', branch: { id: 'b2', name: 'فرع الرقوبة' } },
      }),
      clock,
    );
    expect(item).toMatchObject({ roomName: 'قاعة 4', branchName: 'فرع الرقوبة', isToday: true });
  });

  it('shared lesson: host first, then the other classes; extra flag kept', () => {
    const item = toSessionItem(
      sessionFixture('s', '2026-11-20', '10:00', '12:00', {
        isExtra: true,
        additionalClasses: [{ id: 'c2', status: 'ACTIVE', group: { id: 'g2', name: 'مجموعة الأمل', status: 'ACTIVE' } }],
      }),
      clock,
    );
    expect(item).toMatchObject({ groupNames: ['مجموعة الفجر', 'مجموعة الأمل'], isShared: true, isExtra: true, isToday: false });
  });

  it('attendance progress from the session counts', () => {
    const partial = toSessionItem(
      sessionFixture('p', '2026-11-10', '09:00', '10:00', {
        attendance: { expected: 4, recorded: 1, present: 1, absent: 0, late: 0, excused: 0 },
      }),
      clock,
    );
    expect(partial).toMatchObject({ progress: 'PARTIAL', expected: 4, recorded: 1 });
    expect(toSessionItem(sessionFixture('u', '2026-11-30', '09:00', '10:00'), clock).progress).toBe('UPCOMING');
  });

  it('the cancellation reason only for a cancelled session', () => {
    expect(
      toSessionItem(sessionFixture('a', TODAY, '09:00', '10:00', { status: 'CANCELLED', cancellationReason: 'عطلة' }), clock)
        .cancellationReason,
    ).toBe('عطلة');
    expect(
      toSessionItem(sessionFixture('b', TODAY, '09:00', '10:00', { cancellationReason: 'stale' }), clock).cancellationReason,
    ).toBeNull();
  });

  it('groups consecutive sessions by day, keeping the API order', () => {
    const items = [
      sessionFixture('1', '2026-11-18', '09:00', '10:00'),
      sessionFixture('2', '2026-11-18', '17:00', '18:00'),
      sessionFixture('3', '2026-11-19', '09:00', '10:00'),
    ].map((s) => toSessionItem(s, clock));
    expect(groupByDay(items).map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([
      ['2026-11-18', ['1', '2']],
      ['2026-11-19', ['3']],
    ]);
  });

  it("my role is the session's snapshot (supervisor or assistant), team marks me", () => {
    const s = sessionFixture('s', TODAY, '09:00', '10:00');
    expect(myRoleIn(s, 't-me')).toBe('SUPERVISOR');
    expect(myRoleIn(s, 't-2')).toBe('ASSISTANT');
    expect(myRoleIn(s, 'someone-else')).toBeNull();
    expect(sessionTeam(s, 't-2')).toEqual([
      { id: 't-me', name: 'أحمد السالمي', role: 'SUPERVISOR', isMe: false },
      { id: 't-2', name: 'سارة بن علي', role: 'ASSISTANT', isMe: true },
    ]);
  });
});

import { attendanceFixture, rosterStudentFixture } from './__fixtures__/sessions';
import { attendanceNotices, attendanceState, rosterGroups, rosterState, statusCounts } from './attendance-model';

const clock = { today: '2026-11-16', time: '10:00' };
const s = (date: string, startTime: string, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' = 'SCHEDULED') => ({
  date,
  startTime,
  status,
});

describe('session attendance progress (web sessionProgress)', () => {
  it('cancelled wins over everything', () => {
    expect(attendanceState(s('2026-11-10', '09:00', 'CANCELLED'), { expected: 3, recorded: 3 }, clock)).toBe('CANCELLED');
  });

  it('complete when every expected student is recorded; partial otherwise', () => {
    expect(attendanceState(s('2026-11-10', '09:00'), { expected: 3, recorded: 3 }, clock)).toBe('COMPLETE');
    expect(attendanceState(s('2026-11-10', '09:00'), { expected: 3, recorded: 1 }, clock)).toBe('PARTIAL');
  });

  it('not recorded: a started lesson with no record — including an empty roster', () => {
    expect(attendanceState(s('2026-11-10', '09:00'), { expected: 3, recorded: 0 }, clock)).toBe('NOT_RECORDED');
    expect(attendanceState(s('2026-11-10', '09:00'), { expected: 0, recorded: 0 }, clock)).toBe('NOT_RECORDED');
  });

  it("upcoming: a later date, or TODAY before its start time (the server's recording rule)", () => {
    expect(attendanceState(s('2026-11-17', '09:00'), { expected: 3, recorded: 0 }, clock)).toBe('UPCOMING');
    expect(attendanceState(s('2026-11-16', '17:00'), { expected: 3, recorded: 0 }, clock)).toBe('UPCOMING');
    expect(attendanceState(s('2026-11-16', '10:00'), { expected: 3, recorded: 0 }, clock)).toBe('NOT_RECORDED'); // from the start minute
  });
});

describe('roster (server-computed eligibility, never recomputed)', () => {
  it('counts only EXPECTED students; a recorded-but-not-expected student is not counted', () => {
    const counts = statusCounts([
      rosterStudentFixture('a', 'أ', { recorded: true, status: 'PRESENT' }),
      rosterStudentFixture('b', 'ب', { recorded: true, status: 'ABSENT' }),
      rosterStudentFixture('c', 'ج'),
      rosterStudentFixture('d', 'د', { expected: false, recorded: true, status: 'PRESENT' }),
    ]);
    expect(counts).toEqual({ PRESENT: 1, LATE: 0, ABSENT: 1, EXCUSED: 0, notRecorded: 1 });
  });

  it('normal session: one unnamed group, in the server order', () => {
    const groups = rosterGroups(attendanceFixture());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.groupName).toBeNull();
    expect(groups[0]!.students.map((x) => x.studentId)).toEqual(['st1', 'st2', 'st3']);
  });

  it('shared session: grouped by the class each student comes from ON the date — host first, unknown last', () => {
    const dto = attendanceFixture({
      additionalClasses: [{ id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } }],
      students: [
        rosterStudentFixture('x', 'خديجة', { groupClass: { id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } } }),
        rosterStudentFixture('y', 'عمر', { groupClass: null, expected: false, recorded: true, status: 'PRESENT' }),
        rosterStudentFixture('z', 'محمد'),
      ],
    });
    expect(rosterGroups(dto).map((g) => [g.groupName, g.students.map((x) => x.studentId)])).toEqual([
      ['مجموعة الفجر', ['z']],
      ['مجموعة الأمل', ['x']],
      [null, ['y']],
    ]);
  });
});

describe('server restrictions as notices', () => {
  it('open and correctable: no notice', () => {
    expect(attendanceNotices(attendanceFixture())).toEqual([]);
  });

  it('cancelled session', () => {
    expect(attendanceNotices(attendanceFixture({ sessionStatus: 'CANCELLED', editable: false, correctable: false }))).toEqual([
      { kind: 'cancelled' },
    ]);
  });

  it('not started (editable=false) shows the start time', () => {
    expect(attendanceNotices(attendanceFixture({ editable: false, correctable: false }))).toEqual([
      { kind: 'notStarted', startTime: '09:00' },
    ]);
  });

  it('correction window closed (editable, not correctable)', () => {
    expect(attendanceNotices(attendanceFixture({ correctable: false }))).toEqual([{ kind: 'correctionClosed' }]);
  });

  it('assistant of a shared session: my classes only; empty roster', () => {
    expect(
      attendanceNotices(attendanceFixture({ scope: { allStudents: false, groupClassIds: ['c2'] }, students: [] })).map((n) => n.kind),
    ).toEqual(['assistantScope', 'emptyRoster']);
  });

  it("roster state from the server's own flags", () => {
    expect(rosterState(attendanceFixture())).toBe('PARTIAL');
    expect(rosterState(attendanceFixture({ complete: true }))).toBe('COMPLETE');
    expect(rosterState(attendanceFixture({ recordedCount: 0, editable: false }))).toBe('UPCOMING');
    expect(rosterState(attendanceFixture({ recordedCount: 0 }))).toBe('NOT_RECORDED');
    expect(rosterState(attendanceFixture({ sessionStatus: 'CANCELLED' }))).toBe('CANCELLED');
  });
});

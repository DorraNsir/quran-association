import { attendanceFixture, rosterStudentFixture } from './__fixtures__/sessions';
import { attendanceAction } from './attendance-action';

const allTeamsRecorded = attendanceFixture().teachers.map((t) => ({ ...t, recorded: true, status: 'PRESENT' as const }));
const noTeamRecorded = attendanceFixture().teachers.map((t) => ({ ...t, recorded: false, status: null }));

describe('attendance action — from the server roster only', () => {
  it('تسجيل الحضور: recording open, nothing recorded (students nor team)', () => {
    expect(attendanceAction(attendanceFixture({ students: [rosterStudentFixture('a', 'أنس')], teachers: noTeamRecorded, teacherRecordedCount: 0 }))).toBe('record');
  });

  it('إكمال تسجيل الحضور: partly recorded — students or team members remain', () => {
    expect(attendanceAction(attendanceFixture())).toBe('complete'); // 2/3 students
    const studentsDone = attendanceFixture({
      students: [rosterStudentFixture('a', 'أنس', { recorded: true, status: 'PRESENT' })],
      complete: true,
      teacherRecordedCount: 1,
    });
    expect(attendanceAction(studentsDone)).toBe('complete'); // a team member still unrecorded
  });

  it('عرض وتعديل الحضور: everything recorded and corrections still allowed', () => {
    expect(
      attendanceAction(
        attendanceFixture({
          students: [rosterStudentFixture('a', 'أنس', { recorded: true, status: 'PRESENT' })],
          complete: true,
          teachers: allTeamsRecorded,
          teacherRecordedCount: 2,
        }),
      ),
    ).toBe('edit');
  });

  it('عرض الحضور: not started, cancelled, or all saved with the correction window closed', () => {
    expect(attendanceAction(attendanceFixture({ editable: false, correctable: false }))).toBe('view');
    expect(attendanceAction(attendanceFixture({ sessionStatus: 'CANCELLED' }))).toBe('view');
    expect(
      attendanceAction(
        attendanceFixture({
          correctable: false,
          students: [rosterStudentFixture('a', 'أنس', { recorded: true, status: 'PRESENT' })],
          complete: true,
          teachers: allTeamsRecorded,
          teacherRecordedCount: 2,
        }),
      ),
    ).toBe('view');
  });

  it('window closed but someone still unrecorded: completing remains possible', () => {
    expect(attendanceAction(attendanceFixture({ correctable: false }))).toBe('complete');
  });
});

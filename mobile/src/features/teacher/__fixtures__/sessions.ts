import type { Page, RosterStudent, Session, SessionAttendance } from '../types';

/**
 * TEST-ONLY sessions shaped like SessionDto (GET /teacher/sessions[/:id]).
 * Never imported by app code, so never bundled.
 */
export function sessionFixture(
  id: string,
  date: string,
  start: string,
  end: string,
  extra: Partial<Session> = {},
): Session {
  return {
    id,
    date,
    startTime: start,
    endTime: end,
    status: 'SCHEDULED',
    cancellationReason: null,
    isExtra: false,
    completion: null,
    groupClass: { id: 'c1', status: 'ACTIVE', group: { id: 'g1', name: 'مجموعة الفجر', status: 'ACTIVE' } },
    additionalClasses: [],
    room: { id: 'r1', name: 'قاعة 1', branch: { id: 'b1', name: 'الفرع الرئيسي' } },
    teachers: [
      { id: 't-me', firstName: 'أحمد', lastName: 'السالمي', role: 'SUPERVISOR', status: 'ACTIVE' },
      { id: 't-2', firstName: 'سارة', lastName: 'بن علي', role: 'ASSISTANT', status: 'ACTIVE' },
    ],
    attendance: { expected: 2, recorded: 0, present: 0, absent: 0, late: 0, excused: 0 },
    ...extra,
  };
}

export function pageOf<T>(data: T[], page = 1, pageSize = 20, total = data.length): Page<T> {
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

/** TEST-ONLY roster shaped like SessionAttendanceDto (GET /teacher/sessions/:id/attendance). */
export function rosterStudentFixture(
  id: string,
  firstName: string,
  extra: Partial<RosterStudent> = {},
): RosterStudent {
  return {
    studentId: id,
    firstName,
    lastName: 'التونسي',
    photoUrl: null,
    groupClass: { id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
    expected: true,
    recorded: false,
    status: null,
    note: null,
    recordedAt: null,
    recordedBy: null,
    ...extra,
  };
}

export function attendanceFixture(extra: Partial<SessionAttendance> = {}): SessionAttendance {
  const students = extra.students ?? [
    rosterStudentFixture('st1', 'محمد', { recorded: true, status: 'PRESENT', recordedBy: 'ahmed.t' }),
    rosterStudentFixture('st2', 'آمنة', { recorded: true, status: 'LATE', note: 'وصلت متأخرة 10 دقائق' }),
    rosterStudentFixture('st3', 'يوسف'),
  ];
  const expected = students.filter((s) => s.expected);
  return {
    sessionId: 's1',
    date: '2026-11-16',
    startTime: '09:00',
    endTime: '11:00',
    sessionStatus: 'SCHEDULED',
    completionSource: null,
    groupClass: {
      id: 'c1',
      group: { id: 'g1', name: 'مجموعة الفجر' },
      room: { id: 'r1', name: 'قاعة 1' },
      branch: { id: 'b1', name: 'الفرع الرئيسي' },
    },
    additionalClasses: [],
    scope: { allStudents: true, groupClassIds: ['c1'] },
    expectedCount: expected.length,
    recordedCount: expected.filter((s) => s.recorded).length,
    complete: expected.length > 0 && expected.every((s) => s.recorded),
    editable: true,
    correctable: true,
    teacherExpectedCount: 2,
    teacherRecordedCount: 1,
    teachers: [
      { teacherId: 't-me', firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, role: 'SUPERVISOR', recorded: true, status: 'PRESENT', note: null },
      { teacherId: 't-2', firstName: 'سارة', lastName: 'بن علي', photoUrl: null, role: 'ASSISTANT', recorded: false, status: null, note: null },
    ],
    ...extra,
    students,
  };
}

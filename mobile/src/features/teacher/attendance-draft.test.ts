import { attendanceFixture, rosterStudentFixture } from './__fixtures__/sessions';
import {
  canEditStudent,
  canEditTeacher,
  effective,
  EMPTY_DRAFTS,
  markRestPresent,
  NOTE_MAX,
  pendingCount,
  savePayload,
  setNote,
  setStatus,
  studentSubject,
  teacherSubject,
  unrecordedAfterSave,
  type AttendanceDrafts,
} from './attendance-draft';
import type { RosterTeacher } from './types';

// st1 PRESENT (saved), st2 LATE (saved, with a note), st3 not recorded;
// team: t-me SUPERVISOR (PRESENT saved), t-2 ASSISTANT (not recorded)
const dto = attendanceFixture();
const st = (id: string) => studentSubject(dto.students.find((s) => s.studentId === id)!);
const tt = (id: string) => teacherSubject(dto.teachers.find((t) => t.teacherId === id)!);
const withStudents = (students: AttendanceDrafts['students']): AttendanceDrafts => ({ ...EMPTY_DRAFTS, students });
const withTeachers = (teachers: AttendanceDrafts['teachers']): AttendanceDrafts => ({ ...EMPTY_DRAFTS, teachers });

describe('students — who may be edited (server flags only)', () => {
  it('open session, correctable: every expected student of my scope', () => {
    expect(dto.students.map((s) => canEditStudent(dto, s))).toEqual([true, true, true]);
  });

  it('future (editable=false) or cancelled: nobody', () => {
    const future = attendanceFixture({ editable: false, correctable: false });
    expect(future.students.some((s) => canEditStudent(future, s))).toBe(false);
    const cancelled = attendanceFixture({ sessionStatus: 'CANCELLED', editable: true });
    expect(cancelled.students.some((s) => canEditStudent(cancelled, s))).toBe(false);
  });

  it('correction window closed: only the not-yet-recorded students', () => {
    const closed = attendanceFixture({ correctable: false });
    expect(closed.students.map((s) => [s.studentId, canEditStudent(closed, s)])).toEqual([
      ['st1', false],
      ['st2', false],
      ['st3', true],
    ]);
  });

  it('no longer expected: an EXISTING record is correctable (as the web), never a new one', () => {
    const recorded = rosterStudentFixture('x', 'سليم', { expected: false, recorded: true, status: 'ABSENT' });
    const unrecorded = rosterStudentFixture('y', 'سامي', { expected: false });
    const d = attendanceFixture({ students: [recorded, unrecorded] });
    expect(canEditStudent(d, recorded)).toBe(true);
    expect(canEditStudent(d, unrecorded)).toBe(false);
    // …and still subject to the correction window
    expect(canEditStudent(attendanceFixture({ students: [recorded], correctable: false }), recorded)).toBe(false);
  });

  it('assistant of a shared session: only students of the assigned classes', () => {
    const d = attendanceFixture({
      scope: { allStudents: false, groupClassIds: ['c2'] },
      students: [
        rosterStudentFixture('mine', 'خديجة', { groupClass: { id: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } } }),
        rosterStudentFixture('other', 'محمد'), // c1 — not my class
        rosterStudentFixture('unknown', 'عمر', { groupClass: null }),
      ],
    });
    expect(d.students.map((s) => canEditStudent(d, s))).toEqual([true, false, false]);
  });
});

describe('team members — every member, me included; no student scope', () => {
  it('open session: supervisor, assistant and a former member already recorded are all editable', () => {
    const former: RosterTeacher = {
      teacherId: 't-old', firstName: 'علي', lastName: 'قديم', photoUrl: null, role: null, recorded: true, status: 'PRESENT', note: null,
    };
    const d = attendanceFixture({ teachers: [...dto.teachers, former] });
    expect(d.teachers.map((t) => canEditTeacher(d, t))).toEqual([true, true, true]);
  });

  it('an assistant of a shared session (limited student scope) still records the whole team', () => {
    const d = attendanceFixture({ scope: { allStudents: false, groupClassIds: ['c2'] }, students: [] });
    expect(d.teachers.every((t) => canEditTeacher(d, t))).toBe(true);
  });

  it('future / cancelled: no member; window closed: only unrecorded members', () => {
    const future = attendanceFixture({ editable: false, correctable: false });
    expect(future.teachers.some((t) => canEditTeacher(future, t))).toBe(false);
    const cancelled = attendanceFixture({ sessionStatus: 'CANCELLED' });
    expect(cancelled.teachers.some((t) => canEditTeacher(cancelled, t))).toBe(false);
    const closed = attendanceFixture({ correctable: false });
    expect(closed.teachers.map((t) => [t.teacherId, canEditTeacher(closed, t)])).toEqual([
      ['t-me', false],
      ['t-2', true],
    ]);
  });
});

describe('the PUT body: only real changes, with expectedStatus — `records` and/or `teachers`', () => {
  it('a student-only save has no `teachers` key', () => {
    const body = savePayload(dto, withStudents(setStatus(new Map(), st('st3'), 'ABSENT')));
    expect(body).toEqual({ records: [{ studentId: 'st3', status: 'ABSENT', expectedStatus: null }] });
  });

  it('a teacher-only save has no `records` key: recording myself and the assistant', () => {
    let teachers = setStatus(new Map(), tt('t-me'), 'LATE'); // correcting myself (saved PRESENT)
    teachers = setStatus(teachers, tt('t-2'), 'PRESENT'); // first recording of the assistant
    expect(savePayload(dto, withTeachers(teachers))).toEqual({
      teachers: [
        { teacherId: 't-me', status: 'LATE', expectedStatus: 'PRESENT' },
        { teacherId: 't-2', status: 'PRESENT', expectedStatus: null },
      ],
    });
  });

  it('a combined save sends both parts in ONE body', () => {
    const drafts: AttendanceDrafts = {
      students: setStatus(new Map(), st('st3'), 'PRESENT'),
      teachers: setStatus(new Map(), tt('t-2'), 'ABSENT'),
    };
    expect(savePayload(dto, drafts)).toEqual({
      records: [{ studentId: 'st3', status: 'PRESENT', expectedStatus: null }],
      teachers: [{ teacherId: 't-2', status: 'ABSENT', expectedStatus: null }],
    });
    expect(pendingCount(dto, drafts)).toBe(2);
  });

  it('a correction of a recorded, no-longer-expected student is sent with its expectedStatus', () => {
    const x = rosterStudentFixture('x', 'سليم', { expected: false, recorded: true, status: 'ABSENT' });
    const d = attendanceFixture({ students: [x] });
    expect(savePayload(d, withStudents(setStatus(new Map(), studentSubject(x), 'EXCUSED')))).toEqual({
      records: [{ studentId: 'x', status: 'EXCUSED', expectedStatus: 'ABSENT' }],
    });
  });

  it('selecting the saved status again is not a change; an unsaved edit can be undone', () => {
    expect(pendingCount(dto, withStudents(setStatus(setStatus(new Map(), st('st1'), 'ABSENT'), st('st1'), 'PRESENT')))).toBe(0);
    const once = setStatus(new Map(), tt('t-2'), 'PRESENT');
    expect(pendingCount(dto, withTeachers(setStatus(once, tt('t-2'), 'PRESENT')))).toBe(0);
    // A saved status cannot be removed: tapping it keeps it
    expect(effective(setStatus(new Map(), st('st1'), 'PRESENT'), st('st1')).status).toBe('PRESENT');
  });

  it('edits of rows the server no longer allows are never sent (students and teachers)', () => {
    const drafts: AttendanceDrafts = {
      students: setStatus(setStatus(new Map(), st('st1'), 'ABSENT'), st('st3'), 'PRESENT'),
      teachers: setStatus(setStatus(new Map(), tt('t-me'), 'ABSENT'), tt('t-2'), 'PRESENT'),
    };
    const closed = attendanceFixture({ correctable: false });
    expect(savePayload(closed, drafts)).toEqual({
      records: [{ studentId: 'st3', status: 'PRESENT', expectedStatus: null }],
      teachers: [{ teacherId: 't-2', status: 'PRESENT', expectedStatus: null }],
    });
  });
});

describe('notes: omitted = kept, "" = cleared, ≤ 300 — same rule for teachers', () => {
  it('a status change alone never touches the saved note', () => {
    const body = savePayload(dto, withStudents(setStatus(new Map(), st('st2'), 'PRESENT')));
    expect(body.records![0]).not.toHaveProperty('note');
  });

  it('an edited note is sent trimmed; clearing it sends null', () => {
    expect(savePayload(dto, withStudents(setNote(new Map(), st('st2'), '  جديد  '))).records![0]).toEqual({
      studentId: 'st2',
      status: 'LATE',
      expectedStatus: 'LATE',
      note: 'جديد',
    });
    expect(savePayload(dto, withStudents(setNote(new Map(), st('st2'), '   '))).records![0]).toMatchObject({ note: null });
  });

  it("a teacher's note goes in `teachers`", () => {
    expect(savePayload(dto, withTeachers(setNote(new Map(), tt('t-me'), 'غادر مبكرًا')))).toEqual({
      teachers: [{ teacherId: 't-me', status: 'PRESENT', expectedStatus: 'PRESENT', note: 'غادر مبكرًا' }],
    });
  });

  it('a note needs a status; it is capped at 300 characters', () => {
    const empty = new Map();
    expect(setNote(empty, st('st3'), 'x')).toBe(empty);
    const draft = setNote(setStatus(new Map(), st('st3'), 'EXCUSED'), st('st3'), 'م'.repeat(NOTE_MAX + 50));
    expect(savePayload(dto, withStudents(draft)).records![0]!.note).toHaveLength(NOTE_MAX);
  });
});

describe('bulk and counts', () => {
  it('«تحديد الباقين حاضرين» only fills unrecorded, editable, EXPECTED students — never teachers', () => {
    const d = attendanceFixture({
      students: [
        rosterStudentFixture('a', 'أ', { recorded: true, status: 'ABSENT' }),
        rosterStudentFixture('b', 'ب'),
        rosterStudentFixture('c', 'ج', { expected: false, recorded: true, status: 'ABSENT' }),
      ],
    });
    expect(savePayload(d, withStudents(markRestPresent(new Map(), d)))).toEqual({
      records: [{ studentId: 'b', status: 'PRESENT', expectedStatus: null }],
    });
  });

  it('partial: expected students still unrecorded after the save (teachers do not count)', () => {
    expect(unrecordedAfterSave(dto, EMPTY_DRAFTS)).toBe(1);
    expect(unrecordedAfterSave(dto, withTeachers(setStatus(new Map(), tt('t-2'), 'PRESENT')))).toBe(1);
    expect(unrecordedAfterSave(dto, withStudents(setStatus(new Map(), st('st3'), 'PRESENT')))).toBe(0);
  });
});

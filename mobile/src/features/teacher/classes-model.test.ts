import { ME, workspaceFixture } from './__fixtures__/workspace';
import {
  ageOn,
  classRoster,
  findTeacherClass,
  formatPhone,
  phoneHref,
  studentProfile,
  studentsLabel,
} from './classes-model';
import { teacherClasses } from './dashboard-model';

const TODAY = '2026-11-16';

describe('class ownership and visibility', () => {
  it('lists only classes I supervise or assist in — never another teacher’s class', () => {
    const ws = workspaceFixture();
    expect(teacherClasses(ws).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(findTeacherClass(ws, 'c3')).toBeNull(); // host of a shared slot, not mine
    expect(findTeacherClass(ws, 'unknown')).toBeNull();
  });

  it('an archived class is not visible, even if the bundle still carried it', () => {
    const ws = workspaceFixture();
    ws.groupClasses[0]!.status = 'ARCHIVED';
    expect(findTeacherClass(ws, 'c1')).toBeNull();
    expect(classRoster(ws, 'c1')).toEqual([]);
  });

  it('an INACTIVE class stays visible (not archived) with its status', () => {
    expect(findTeacherClass(workspaceFixture(), 'c2')?.status).toBe('INACTIVE');
  });
});

describe('supervisor and assistant roles', () => {
  const [c1, c2] = teacherClasses(workspaceFixture());

  it('my role per class; supervisor assignments listed first', () => {
    expect([c1!.id, c1!.role]).toEqual(['c1', 'SUPERVISOR']);
    expect([c2!.id, c2!.role]).toEqual(['c2', 'ASSISTANT']);
  });

  it('the team: supervisor first, then assistants, me marked', () => {
    expect(c1!.team).toEqual([
      { id: ME, name: 'أحمد السالمي', role: 'SUPERVISOR', isMe: true },
      { id: 't-2', name: 'سارة بن علي', role: 'ASSISTANT', isMe: false },
    ]);
    expect(c2!.team).toEqual([
      { id: 't-2', name: 'سارة بن علي', role: 'SUPERVISOR', isMe: false },
      { id: ME, name: 'أحمد السالمي', role: 'ASSISTANT', isMe: true },
    ]);
  });

  it('rooms come from the slots the class meets in, including shared slots it joins', () => {
    expect(c1!.rooms).toEqual(['قاعة 1']);
    expect(c2!.rooms).toEqual(['قاعة 2']); // only through the shared slot hosted by c3
    expect(c1!.audience).toBe('أطفال 8-12 سنة');
  });
});

describe('shared schedules, several rooms, other branches', () => {
  /** c1 also meets on Thursday in a room of ANOTHER branch (a slot shared with c3). */
  function withCrossBranchSlot() {
    const ws = workspaceFixture();
    ws.branches.push({ id: 'b2', name: 'فرع الرقوبة', status: 'ACTIVE' });
    ws.rooms.push({ id: 'r9', branchId: 'b2', name: 'قاعة 4' });
    ws.schedules.push({
      id: 's9', groupClassId: 'c3', additionalGroupClassIds: ['c1'], roomId: 'r9',
      participants: [
        { groupClassId: 'c3', group: { id: 'g3', name: 'مجموعة أخرى' } },
        { groupClassId: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
      ],
      dayOfWeek: 'THU', startTime: '16:00', endTime: '18:00',
    });
    return ws;
  }

  it('a shared slot names the partner groups (never the class itself)', () => {
    const c2 = findTeacherClass(workspaceFixture(), 'c2')!;
    expect(c2.slots[0]).toMatchObject({ shared: true, sharedWith: ['مجموعة أخرى'] });
    const c1 = findTeacherClass(workspaceFixture(), 'c1')!;
    expect(c1.slots.every((s) => !s.shared && s.sharedWith.length === 0)).toBe(true);
  });

  it('several rooms: own slots first, then joined shared slots', () => {
    const c1 = findTeacherClass(withCrossBranchSlot(), 'c1')!;
    expect(c1.rooms).toEqual(['قاعة 1', 'قاعة 4']);
  });

  it('a slot in a room of another branch says so; same-branch slots do not', () => {
    const c1 = findTeacherClass(withCrossBranchSlot(), 'c1')!;
    const thursday = c1.slots.find((s) => s.day === 'THU')!;
    expect(thursday).toMatchObject({ roomName: 'قاعة 4', roomBranchName: 'فرع الرقوبة', sharedWith: ['مجموعة أخرى'] });
    expect(c1.slots.filter((s) => s.day !== 'THU').every((s) => s.roomBranchName === null)).toBe(true);
    // Slots stay in week order: MON, WED, THU
    expect(c1.slots.map((s) => s.day)).toEqual(['MON', 'WED', 'THU']);
  });
});

describe('student lists belong to the right class', () => {
  it('a class roster: ACTIVE students currently in THAT class only, sorted by name', () => {
    const ws = workspaceFixture();
    expect(classRoster(ws, 'c1').map((s) => s.id)).toEqual(['st2', 'st1']); // آمنة, محمد
    expect(classRoster(ws, 'c2').map((s) => s.id)).toEqual(['st4']);
  });

  it('never lists a student of another class, inactive students, or students of a class that is not mine', () => {
    const ws = workspaceFixture();
    const c1 = classRoster(ws, 'c1').map((s) => s.id);
    expect(c1).not.toContain('st3'); // INACTIVE
    expect(c1).not.toContain('st4'); // my other class
    expect(classRoster(ws, 'c3')).toEqual([]); // st5's class is not mine
  });

  it('age from the date of birth on the platform day; unknown stays null', () => {
    const roster = classRoster(workspaceFixture(), 'c1', TODAY);
    expect(roster.find((s) => s.id === 'st1')?.age).toBe(12);
    expect(roster.find((s) => s.id === 'st2')?.age).toBeNull();
    expect(classRoster(workspaceFixture(), 'c1')[0]?.age).toBeNull(); // no "today" → no age
  });

  it('initials for the avatar', () => {
    expect(classRoster(workspaceFixture(), 'c2')[0]!.initials).toBe('خا');
  });
});

describe('student profile', () => {
  it('a student of my class: their class, age and permitted contact fields', () => {
    const p = studentProfile(workspaceFixture(), 'st1', TODAY)!;
    expect(p.name).toBe('محمد التونسي');
    expect(p.age).toBe(12);
    expect(p.groupClass.id).toBe('c1');
    expect(p.student.phone).toBe('98765432');
    expect(p.student.guardianPhone).toBe('22123456');
    expect(p.student).not.toHaveProperty('cin');
    expect(p.student).not.toHaveProperty('address');
  });

  it('unknown age when no date of birth', () => {
    expect(studentProfile(workspaceFixture(), 'st2', TODAY)!.age).toBeNull();
  });

  it('no access: unknown student, a student of a class that is not mine, an archived student', () => {
    const ws = workspaceFixture();
    expect(studentProfile(ws, 'nobody', TODAY)).toBeNull();
    expect(studentProfile(ws, 'st5', TODAY)).toBeNull();
    ws.students[0]!.status = 'ARCHIVED';
    expect(studentProfile(ws, 'st1', TODAY)).toBeNull();
  });

  it('an INACTIVE student of my class can still be opened (as on the web)', () => {
    expect(studentProfile(workspaceFixture(), 'st3', TODAY)?.student.status).toBe('INACTIVE');
  });
});

describe('formatting', () => {
  it('age in whole years, birthday not yet reached', () => {
    expect(ageOn('2014-05-20', '2026-05-19')).toBe(11);
    expect(ageOn('2014-05-20', '2026-05-20')).toBe(12);
  });

  it('Tunisian phone display and dialer link (web PhoneLink)', () => {
    expect(formatPhone('22123456')).toBe('22 123 456');
    expect(formatPhone('+33 6 12 34')).toBe('+33 6 12 34');
    expect(phoneHref('22 123 456')).toBe('tel:+21622123456');
    expect(phoneHref('+21698765432')).toBe('tel:+21698765432');
  });

  it('Arabic student counts (web countLabels.students)', () => {
    expect([0, 1, 2, 3, 10, 11].map(studentsLabel)).toEqual([
      '0 طلبة',
      'طالب واحد',
      'طالبان',
      '3 طلبة',
      '10 طلبة',
      '11 طالبًا',
    ]);
  });

});

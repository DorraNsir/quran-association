import { workspaceFixture, ME } from './__fixtures__/workspace';
import { formatDuration, minutesBetween, teacherWeeklySlots, weekDays, weeklyMinutes } from './schedule-model';
import type { TeacherWorkspace } from './types';

/** c2 (my assisted class) made ACTIVE, so the shared slot s3 it joins is mine. */
function withActiveAssisted(): TeacherWorkspace {
  const ws = workspaceFixture();
  ws.groupClasses = ws.groupClasses.map((c) => (c.id === 'c2' ? { ...c, status: 'ACTIVE' } : c));
  return ws;
}

describe('teacherWeeklySlots', () => {
  it('orders Monday first, then by start time, then by end time', () => {
    const ws = workspaceFixture();
    ws.schedules.push(
      { ...ws.schedules[1]!, id: 's4', dayOfWeek: 'MON', startTime: '08:00', endTime: '09:00' },
      { ...ws.schedules[1]!, id: 's5', dayOfWeek: 'SUN', startTime: '07:00', endTime: '08:00' },
      { ...ws.schedules[1]!, id: 's6', dayOfWeek: 'MON', startTime: '08:00', endTime: '08:30' },
    );
    expect(teacherWeeklySlots(ws).map((s) => s.id)).toEqual(['s6', 's4', 's1', 's2', 's5']);
  });

  it('keeps only running classes: an inactive class (and its shared slot) is skipped', () => {
    const slots = teacherWeeklySlots(workspaceFixture());
    expect(slots.map((s) => s.id)).toEqual(['s1', 's2']); // s3 joined only by inactive c2
    expect(slots.every((s) => s.role === 'SUPERVISOR' && s.classId === 'c1' && !s.shared)).toBe(true);
  });

  it('skips a class whose group is inactive', () => {
    const ws = workspaceFixture();
    ws.groups = ws.groups.map((g) => (g.id === 'g1' ? { ...g, status: 'INACTIVE' } : g));
    expect(teacherWeeklySlots(ws)).toEqual([]);
  });

  it('never lists another teacher\'s class (not in my classes)', () => {
    const ws = workspaceFixture();
    ws.schedules.push({ ...ws.schedules[1]!, id: 's9', groupClassId: 'c3', participants: [] });
    expect(teacherWeeklySlots(ws).some((s) => s.id === 's9')).toBe(false);
  });

  it('a shared slot is listed once, with every group, under my class and my role there', () => {
    const shared = teacherWeeklySlots(withActiveAssisted()).filter((s) => s.id === 's3');
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({
      shared: true,
      groupNames: ['مجموعة أخرى', 'مجموعة الأمل'],
      role: 'ASSISTANT',
      classId: 'c2',
      day: 'SAT',
      roomName: 'قاعة 2',
      branchName: 'الفرع الرئيسي',
      minutes: 120,
    });
  });

  it('a shared slot between two of my classes is listed once, under the supervised one', () => {
    const ws = withActiveAssisted();
    ws.schedules.push({
      id: 's7', groupClassId: 'c2', additionalGroupClassIds: ['c1'], roomId: 'r1',
      participants: [
        { groupClassId: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } },
        { groupClassId: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
      ],
      dayOfWeek: 'TUE', startTime: '10:00', endTime: '11:00',
    });
    const s7 = teacherWeeklySlots(ws).filter((s) => s.id === 's7');
    expect(s7).toHaveLength(1);
    expect(s7[0]).toMatchObject({ role: 'SUPERVISOR', classId: 'c1' });
    expect(ws.groupClasses.find((c) => c.id === 'c1')?.supervisorId).toBe(ME);
  });

  it('uses each slot\'s OWN room, and never guesses a missing room or branch', () => {
    const ws = workspaceFixture();
    ws.schedules[0] = { ...ws.schedules[0]!, roomId: 'r2' }; // s2 meets in another room
    ws.schedules[1] = { ...ws.schedules[1]!, roomId: 'r-unknown' };
    ws.rooms.push({ id: 'r3', branchId: 'b-elsewhere', name: 'قاعة 3' });
    ws.schedules.push({ ...ws.schedules[1]!, id: 's8', roomId: 'r3', dayOfWeek: 'THU' });
    const byId = Object.fromEntries(teacherWeeklySlots(ws).map((s) => [s.id, s]));
    expect(byId.s2).toMatchObject({ roomName: 'قاعة 2', branchName: 'الفرع الرئيسي' });
    expect(byId.s1).toMatchObject({ roomName: null, branchName: null });
    expect(byId.s8).toMatchObject({ roomName: 'قاعة 3', branchName: null }); // branch not in the bundle
  });
});

describe('weekDays / durations', () => {
  it('returns the seven days, Monday first, empty days included', () => {
    const days = weekDays(teacherWeeklySlots(workspaceFixture()));
    expect(days.map((d) => d.day)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(days.map((d) => d.slots.length)).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });

  it('computes durations and the weekly total', () => {
    expect(minutesBetween('09:00', '11:30')).toBe(150);
    expect(minutesBetween('11:00', '09:00')).toBe(0);
    expect(weeklyMinutes(teacherWeeklySlots(workspaceFixture()))).toBe(240);
    expect(formatDuration(240)).toBe('4 س');
    expect(formatDuration(45)).toBe('45 د');
    expect(formatDuration(150)).toBe('2 س 30 د');
  });
});

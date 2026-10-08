import {
  announcementVisibleOn,
  studentAnnouncementWhere,
  studentResourceWhere,
  teacherResourceWhere,
} from './audience.js';
import { stateOf } from './announcements.service.js';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('communication audience rules', () => {
  it('a student without a class only reaches all-students resources / global announcements', () => {
    const scope = {
      studentId: 's',
      groupClassId: null,
      groupId: null,
      branchId: null,
    };
    expect(studentResourceWhere(scope)).toEqual({
      OR: [{ visibility: 'ALL_STUDENTS' }],
    });
    const where = studentAnnouncementWhere(scope, day('2026-10-08'));
    expect(JSON.stringify(where)).not.toContain('SPECIFIC_');
  });

  it('a placed student reaches their CURRENT class and group only', () => {
    const where = studentResourceWhere({
      studentId: 's',
      groupClassId: 'c1',
      groupId: 'g1',
      branchId: 'b1',
    });
    expect(where.OR).toEqual([
      { visibility: 'ALL_STUDENTS' },
      { visibility: 'GROUP', targets: { some: { groupId: 'g1' } } },
      { visibility: 'GROUP_CLASS', targets: { some: { groupClassId: 'c1' } } },
    ]);
  });

  it('teachers see their own resources and those of their current classes', () => {
    const where = teacherResourceWhere(
      { teacherId: 't', classIds: ['c1'], groupIds: ['g1'], branchIds: ['b1'] },
      'u1',
    );
    expect(where.OR).toContainEqual({ publishedByUserId: 'u1' });
    expect(where.OR).toContainEqual({
      visibility: 'GROUP_CLASS',
      targets: { some: { groupClassId: { in: ['c1'] } } },
    });
  });

  it('announcements are visible only while PUBLISHED and within their dates', () => {
    expect(announcementVisibleOn(day('2026-10-08'))).toEqual({
      status: 'PUBLISHED',
      publishedAt: { lte: day('2026-10-08') },
      OR: [{ expiresAt: null }, { expiresAt: { gte: day('2026-10-08') } }],
    });
  });
});

describe('announcement state', () => {
  const base = {
    status: 'PUBLISHED' as const,
    publishedAt: day('2026-10-05'),
    expiresAt: day('2026-10-10') as Date | null,
  };
  const state = (a: object, today = '2026-10-08') =>
    stateOf({ ...base, ...a } as Parameters<typeof stateOf>[0], today);

  it('derives DRAFT / SCHEDULED / ACTIVE / EXPIRED / ARCHIVED', () => {
    expect(state({ status: 'DRAFT' })).toBe('DRAFT');
    expect(state({ status: 'ARCHIVED' })).toBe('ARCHIVED');
    expect(state({}, '2026-10-04')).toBe('SCHEDULED');
    expect(state({}, '2026-10-05')).toBe('ACTIVE');
    expect(state({}, '2026-10-10')).toBe('ACTIVE');
    expect(state({}, '2026-10-11')).toBe('EXPIRED');
    expect(state({ expiresAt: null }, '2030-01-01')).toBe('ACTIVE');
  });
});

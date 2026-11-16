import type { TeacherWorkspace, WsStudent } from '../types';

/**
 * TEST-ONLY data shaped like GET /api/teacher/workspace (TeacherWorkspaceDto).
 * Never imported by app code, so it is never bundled.
 */
export const ME = 't-me';

const student = (id: string, firstName: string, groupClassId: string | null, status: WsStudent['status'] = 'ACTIVE', extra: Partial<WsStudent> = {}): WsStudent => ({
  id,
  firstName,
  lastName: 'التونسي',
  gender: 'MALE',
  dateOfBirth: '2014-05-20',
  phone: null,
  guardianPhone: '22123456',
  photoUrl: null,
  registrationDate: '2025-09-15',
  groupClassId,
  status,
  ...extra,
});

export function workspaceFixture(): TeacherWorkspace {
  return {
    teacher: { id: ME, firstName: 'أحمد', lastName: 'السالمي', photoUrl: null, status: 'ACTIVE', joinedAt: '2024-09-01' },
    branches: [{ id: 'b1', name: 'الفرع الرئيسي', status: 'ACTIVE' }],
    rooms: [
      { id: 'r1', branchId: 'b1', name: 'قاعة 1' },
      { id: 'r2', branchId: 'b1', name: 'قاعة 2' },
    ],
    groups: [
      { id: 'g1', name: 'مجموعة الفجر', audience: 'أطفال 8-12 سنة', status: 'ACTIVE' },
      { id: 'g2', name: 'مجموعة الأمل', audience: null, status: 'ACTIVE' },
      { id: 'g3', name: 'مجموعة أخرى', audience: null, status: 'ACTIVE' },
    ],
    groupClasses: [
      // I supervise c1; I assist in c2 (inactive class); c3 is another teacher's class
      // carried in the bundle only as the host of a shared slot
      { id: 'c1', groupId: 'g1', branchId: 'b1', supervisorId: ME, assistantIds: ['t-2'], status: 'ACTIVE' },
      { id: 'c2', groupId: 'g2', branchId: 'b1', supervisorId: 't-2', assistantIds: [ME], status: 'INACTIVE' },
      { id: 'c3', groupId: 'g3', branchId: 'b1', supervisorId: 't-3', assistantIds: [], status: 'ACTIVE' },
    ],
    teachers: [
      { id: 't-2', firstName: 'سارة', lastName: 'بن علي', photoUrl: null, status: 'ACTIVE', joinedAt: '2023-09-01' },
      { id: 't-3', firstName: 'يوسف', lastName: 'الحمدي', photoUrl: null, status: 'ACTIVE', joinedAt: '2022-09-01' },
    ],
    schedules: [
      {
        id: 's2', groupClassId: 'c1', additionalGroupClassIds: [], roomId: 'r1',
        participants: [{ groupClassId: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } }],
        dayOfWeek: 'WED', startTime: '17:00', endTime: '19:00',
      },
      {
        id: 's1', groupClassId: 'c1', additionalGroupClassIds: [], roomId: 'r1',
        participants: [{ groupClassId: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } }],
        dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00',
      },
      {
        id: 's3', groupClassId: 'c3', additionalGroupClassIds: ['c2'], roomId: 'r2',
        participants: [
          { groupClassId: 'c3', group: { id: 'g3', name: 'مجموعة أخرى' } },
          { groupClassId: 'c2', group: { id: 'g2', name: 'مجموعة الأمل' } },
        ],
        dayOfWeek: 'SAT', startTime: '10:00', endTime: '12:00',
      },
    ],
    students: [
      student('st1', 'محمد', 'c1', 'ACTIVE', { phone: '98765432' }),
      student('st2', 'آمنة', 'c1', 'ACTIVE', { gender: 'FEMALE', dateOfBirth: null, guardianPhone: null }),
      student('st3', 'علي', 'c1', 'INACTIVE'),
      student('st4', 'خديجة', 'c2', 'ACTIVE', { gender: 'FEMALE' }),
      student('st5', 'عمر', 'c3', 'ACTIVE'),
    ],
  };
}

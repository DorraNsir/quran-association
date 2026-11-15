import { availableWorkspaces, canUseWorkspace, landingWorkspace } from './workspaces';

describe('workspace rules (same as the web)', () => {
  it('ADMIN needs only the role', () => {
    expect(canUseWorkspace({ roles: ['ADMIN'], teacherId: null, studentId: null }, 'admin')).toBe(true);
  });

  it('TEACHER / STUDENT also need the linked profile', () => {
    expect(canUseWorkspace({ roles: ['TEACHER'], teacherId: null, studentId: null }, 'teacher')).toBe(false);
    expect(canUseWorkspace({ roles: ['TEACHER'], teacherId: 't', studentId: null }, 'teacher')).toBe(true);
    expect(canUseWorkspace({ roles: ['STUDENT'], teacherId: null, studentId: null }, 'student')).toBe(false);
    expect(canUseWorkspace({ roles: ['STUDENT'], teacherId: null, studentId: 's' }, 'student')).toBe(true);
  });

  it('a profile without the role grants nothing', () => {
    expect(canUseWorkspace({ roles: ['STUDENT'], teacherId: 't', studentId: 's' }, 'teacher')).toBe(false);
  });

  it('landing: admin → teacher → student, or none', () => {
    const multi = { roles: ['ADMIN', 'TEACHER'] as const, teacherId: 't', studentId: null };
    expect(landingWorkspace({ ...multi, roles: [...multi.roles] })).toBe('admin');
    expect(availableWorkspaces({ ...multi, roles: [...multi.roles] })).toEqual(['admin', 'teacher']);
    expect(landingWorkspace({ roles: ['STUDENT'], teacherId: null, studentId: 's' })).toBe('student');
    expect(landingWorkspace({ roles: ['TEACHER'], teacherId: null, studentId: null })).toBeNull();
  });
});

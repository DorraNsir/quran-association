import type { Role, SessionUser } from './types';

export type Workspace = 'admin' | 'teacher' | 'student';

export const WORKSPACES: readonly Workspace[] = ['admin', 'teacher', 'student'];

const ROLE_OF: Record<Workspace, Role> = {
  admin: 'ADMIN',
  teacher: 'TEACHER',
  student: 'STUDENT',
};

/**
 * Same rule as the web (frontend/src/lib/auth/session-user.ts): ADMIN needs
 * the role; TEACHER / STUDENT also need the linked profile. Navigation only —
 * every API call is authorized by the backend.
 */
export function canUseWorkspace(
  user: Pick<SessionUser, 'roles' | 'teacherId' | 'studentId'>,
  workspace: Workspace,
): boolean {
  if (!user.roles.includes(ROLE_OF[workspace])) return false;
  if (workspace === 'teacher') return Boolean(user.teacherId);
  if (workspace === 'student') return Boolean(user.studentId);
  return true;
}

export function availableWorkspaces(
  user: Pick<SessionUser, 'roles' | 'teacherId' | 'studentId'>,
): Workspace[] {
  return WORKSPACES.filter((w) => canUseWorkspace(user, w));
}

/** Landing workspace: admin first, then teacher, then student — or none. */
export function landingWorkspace(
  user: Pick<SessionUser, 'roles' | 'teacherId' | 'studentId'>,
): Workspace | null {
  return availableWorkspaces(user)[0] ?? null;
}

import type { SessionUser } from "@/lib/api/session"
import type { Workspace } from "@/lib/workspace"
import type { User } from "@/types/domain"

/** The API account adapted to the frontend User shape used by the shell components. */
export function toUser(session: SessionUser): User {
  return {
    id: session.id,
    username: session.username,
    personId: session.person.id,
    firstName: session.person.firstName,
    lastName: session.person.lastName,
    email: session.person.email ?? "",
    phone: session.person.phone ?? "",
    photoUrl: session.person.photoUrl ?? undefined,
    roles: session.roles,
    teacherId: session.teacherId ?? undefined,
    studentId: session.studentId ?? undefined,
  }
}

/**
 * Whether the account has a usable workspace. ADMIN needs the role;
 * TEACHER / STUDENT also need the linked profile (the API checks the same).
 * Navigation only — every API call is authorized by the backend.
 */
export function canUseWorkspace(user: Pick<SessionUser, "roles" | "teacherId" | "studentId">, workspace: Workspace) {
  if (workspace === "admin") return user.roles.includes("ADMIN")
  if (workspace === "teacher") return user.roles.includes("TEACHER") && Boolean(user.teacherId)
  return user.roles.includes("STUDENT") && Boolean(user.studentId)
}

/** Landing workspace: admin first, then teacher, then student — or none. */
export function landingPath(user: Pick<SessionUser, "roles" | "teacherId" | "studentId">): string | null {
  for (const workspace of ["admin", "teacher", "student"] as const)
    if (canUseWorkspace(user, workspace)) return `/${workspace}`
  return null
}

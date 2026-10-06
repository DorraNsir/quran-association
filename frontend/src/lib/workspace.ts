import type { GroupClass, ID, User } from "@/types/domain"

/**
 * The two workspaces of one account. Shared screens (session details,
 * attendance, memorization…) take a workspace so their links stay inside it.
 */
export type Workspace = "admin" | "teacher" | "student"

/**
 * Workspaces that use the shared management screens. The student space is
 * read-only and never renders them (they carry edit actions and links to
 * other students).
 */
export type StaffWorkspace = Exclude<Workspace, "student">

/** Landing workspace of an account: admin first, then teacher, then student space. */
export function homeOf(user: Pick<User, "roles" | "teacherId" | "studentId">) {
  if (user.roles.includes("ADMIN")) return "/admin"
  if (user.roles.includes("TEACHER") && user.teacherId) return "/teacher"
  if (user.roles.includes("STUDENT") && user.studentId) return "/student"
  return "/admin"
}

export function workspacePaths(workspace: StaffWorkspace) {
  const base = `/${workspace}`
  return {
    home: base,
    sessions: `${base}/sessions`,
    session: (id: ID) => `${base}/sessions/${id}`,
    attendance: (id: ID) => `${base}/sessions/${id}/attendance`,
    student: (id: ID, tab?: string) => `${base}/students/${id}${tab ? `?tab=${tab}` : ""}`,
    /** Admins open the pedagogical group; teachers open their own class. */
    groupClass: (groupClass: Pick<GroupClass, "id" | "groupId">) =>
      workspace === "admin" ? `/admin/groups/${groupClass.groupId}` : `/teacher/classes/${groupClass.id}`,
    schedule: workspace === "admin" ? "/admin/calendar" : "/teacher/schedule",
  }
}

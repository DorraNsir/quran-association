import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { DEFAULT_USER_ID, students, users } from "@/lib/mock"
import { homeOf } from "@/lib/workspace"
import type { User } from "@/types/domain"

import { MOCK_ACCOUNT_COOKIE } from "./mock-account"

/**
 * The signed-in user. Mock phase: read from the prototype account cookie.
 * Later: read from the real session (JWT / NestJS). Everything else only
 * calls this function, so swapping the implementation is local.
 */
export async function getCurrentUser(): Promise<User> {
  const id = (await cookies()).get(MOCK_ACCOUNT_COOKIE)?.value
  return users.find((u) => u.id === id) ?? users.find((u) => u.id === DEFAULT_USER_ID) ?? users[0]
}

export { homeOf }

/**
 * The signed-in teacher for Teacher Space pages: the account's teacher
 * profile and the students it may see. Accounts without one never reach
 * these pages (the teacher layout redirects them).
 */
export async function getCurrentTeacher() {
  const user = await getCurrentUser()
  const teacherId = user.roles.includes("TEACHER") ? user.teacherId : undefined
  if (!teacherId) redirect(homeOf(user))
  return { user, teacherId }
}

/**
 * The signed-in student for Student Space pages. Pages never take a student
 * id from the URL: everything is derived from this, so a student can only
 * ever reach their own data (the API will enforce the same rule).
 */
export async function getCurrentStudent() {
  const user = await getCurrentUser()
  const studentId = user.roles.includes("STUDENT") ? user.studentId : undefined
  if (!studentId) redirect(homeOf(user))
  return { user, student: students.find((s) => s.id === studentId) }
}

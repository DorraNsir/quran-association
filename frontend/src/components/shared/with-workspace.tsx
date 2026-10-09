"use client"

import { useStudentWorkspace, useTeacherWorkspace, type StudentWorkspace, type TeacherWorkspace } from "@/lib/api/workspace"

import { QueryState } from "./query-state"

/** Renders children once the signed-in teacher's workspace bundle is loaded. */
export function WithTeacherWorkspace({ children }: { children: (workspace: TeacherWorkspace) => React.ReactNode }) {
  const query = useTeacherWorkspace()
  return <QueryState query={query}>{query.data ? children(query.data) : null}</QueryState>
}

/** Renders children once the signed-in student's workspace bundle is loaded. */
export function WithStudentWorkspace({ children }: { children: (workspace: StudentWorkspace) => React.ReactNode }) {
  const query = useStudentWorkspace()
  return <QueryState query={query}>{query.data ? children(query.data) : null}</QueryState>
}

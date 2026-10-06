import type { Metadata } from "next"

import { SessionsView, type SessionTab } from "@/components/sessions/sessions-view"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherGroupClasses, getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "حصصي" }

const TABS: SessionTab[] = ["today", "pending", "upcoming", "done", "cancelled", "all"]

export default async function TeacherSessionsPage(props: PageProps<"/teacher/sessions">) {
  const { tab } = await props.searchParams
  const { teacherId } = await getCurrentTeacher()
  return (
    <SessionsView
      workspace="teacher"
      groupClassIds={getTeacherGroupClasses(teacherId, lookups).map((a) => a.groupClass.id)}
      lookups={lookups}
      students={getTeacherStudents(teacherId, lookups, students)}
      today={MOCK_TODAY}
      initialTab={TABS.find((t) => t === tab)}
    />
  )
}

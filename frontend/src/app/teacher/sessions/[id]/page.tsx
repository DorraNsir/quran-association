import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SessionScreen } from "@/components/sessions/session-screen"
import { NoAccess } from "@/components/shared/no-access"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, sessions, students } from "@/lib/mock"
import { canTeacherAccessSession, getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "الحصة" }

export default async function TeacherSessionPage(props: PageProps<"/teacher/sessions/[id]">) {
  const { id } = await props.params
  const session = sessions.find((s) => s.id === id)
  if (!session) notFound()
  const { teacherId } = await getCurrentTeacher()
  if (!canTeacherAccessSession(teacherId, session, lookups)) {
    return <NoAccess backHref="/teacher/sessions" backLabel="العودة إلى حصصي" />
  }
  return (
    <SessionScreen sessionId={session.id} mode="details" workspace="teacher" lookups={lookups}
      students={getTeacherStudents(teacherId, lookups, students)} today={MOCK_TODAY} />
  )
}

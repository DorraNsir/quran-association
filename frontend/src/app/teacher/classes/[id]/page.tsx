import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NoAccess } from "@/components/shared/no-access"
import { TeacherClassDetails } from "@/components/teacher/teacher-classes"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { groupClasses, groups, lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherGroupClasses, getTeacherStudents } from "@/lib/teacher-access"

export async function generateMetadata(props: PageProps<"/teacher/classes/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const groupClass = groupClasses.find((c) => c.id === id)
  return { title: groups.find((g) => g.id === groupClass?.groupId)?.name ?? "المجموعة" }
}

export default async function TeacherClassPage(props: PageProps<"/teacher/classes/[id]">) {
  const { id } = await props.params
  if (!groupClasses.some((c) => c.id === id)) notFound()
  const { teacherId } = await getCurrentTeacher()
  const assignment = getTeacherGroupClasses(teacherId, lookups).find((a) => a.groupClass.id === id)
  if (!assignment) return <NoAccess backHref="/teacher/classes" backLabel="العودة إلى مجموعاتي" />
  return (
    <TeacherClassDetails
      assignment={assignment}
      teacherId={teacherId}
      lookups={lookups}
      students={getTeacherStudents(teacherId, lookups, students)}
      today={MOCK_TODAY}
    />
  )
}

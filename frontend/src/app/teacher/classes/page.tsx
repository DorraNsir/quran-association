import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { TeacherClasses } from "@/components/teacher/teacher-classes"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "مجموعاتي" }

export default async function TeacherClassesPage() {
  const { teacherId } = await getCurrentTeacher()
  return (
    <>
      <PageHeader title="مجموعاتي" description="الحلقات التي تشرف عليها أو تساعد فيها، في كل فرع." />
      <TeacherClasses teacherId={teacherId} lookups={lookups} students={getTeacherStudents(teacherId, lookups, students)} today={MOCK_TODAY} />
    </>
  )
}

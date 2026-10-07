import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { TeacherStudentsView } from "@/components/teacher/teacher-students-view"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "طلابي" }

export default async function TeacherStudentsPage() {
  const { teacherId } = await getCurrentTeacher()
  return (
    <>
      <PageHeader title="طلابي" description="طلبة مجموعاتك فقط، مع آخر سورة محفوظة ونسبة الحضور." />
      <TeacherStudentsView teacherId={teacherId} lookups={lookups} students={getTeacherStudents(teacherId, lookups, students)} today={MOCK_TODAY} />
    </>
  )
}

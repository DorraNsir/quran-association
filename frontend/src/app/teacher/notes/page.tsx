import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { TeacherNotes } from "@/components/teacher/teacher-notes"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "ملاحظاتي" }

export default async function TeacherNotesPage() {
  const { teacherId } = await getCurrentTeacher()
  return (
    <>
      <PageHeader title="ملاحظاتي" description="ملاحظاتك الخاصة حول تقدّم طلبتك وسلوكهم. لا يطّلع عليها الطلبة ولا الأولياء." />
      <TeacherNotes teacherId={teacherId} lookups={lookups} students={getTeacherStudents(teacherId, lookups, students).filter((s) => s.status === "ACTIVE")}
        today={MOCK_TODAY} />
    </>
  )
}

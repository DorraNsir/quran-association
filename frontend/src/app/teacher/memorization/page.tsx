import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { TeacherMemorization } from "@/components/teacher/teacher-memorization"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { academicYears, lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default async function TeacherMemorizationPage() {
  const { teacherId } = await getCurrentTeacher()
  return (
    <>
      <PageHeader title="متابعة الحفظ" description="آخر سورة حفظها كل طالب من طلبتك، حسب السنة الدراسية والسداسي." />
      <TeacherMemorization teacherId={teacherId} lookups={lookups} students={getTeacherStudents(teacherId, lookups, students)}
        academicYears={academicYears} today={MOCK_TODAY} />
    </>
  )
}

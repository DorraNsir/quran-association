import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { StudentDashboard } from "@/components/student/student-space"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { weekdayOf } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { academicYears, lookups, MOCK_TODAY } from "@/lib/mock"
import { getStudentGroupClass } from "@/lib/student-access"

export const metadata: Metadata = { title: "فضاء الطالب" }

export default async function StudentHomePage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return (
    <>
      <PageHeader
        title={`السلام عليكم ${student.firstName}`}
        description={`${labels.weekday[weekdayOf(MOCK_TODAY)]} ${formatDate(MOCK_TODAY)}`}
      />
      <StudentDashboard student={student} view={getStudentGroupClass(student, lookups)} lookups={lookups}
        academicYears={academicYears} today={MOCK_TODAY} />
    </>
  )
}

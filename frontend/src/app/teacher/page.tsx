import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { TeacherDashboard } from "@/components/teacher/teacher-dashboard"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { weekdayOf } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { getTeacherStudents } from "@/lib/teacher-access"

export const metadata: Metadata = { title: "فضاء المعلم" }

export default async function TeacherHomePage() {
  const { user, teacherId } = await getCurrentTeacher()
  return (
    <>
      <PageHeader
        title={`مرحبًا، ${user.firstName}`}
        description={`${labels.weekday[weekdayOf(MOCK_TODAY)]} ${formatDate(MOCK_TODAY)} — حصصك ومهامك لهذا اليوم.`}
      />
      <TeacherDashboard
        teacherId={teacherId}
        lookups={lookups}
        students={getTeacherStudents(teacherId, lookups, students)}
        today={MOCK_TODAY}
      />
    </>
  )
}

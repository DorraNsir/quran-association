import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { MyAttendance } from "@/components/student/student-space"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الحضور" }

export default async function StudentAttendancePage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return (
    <>
      <PageHeader title="سجل الحضور" description="حضورك في حصص مجموعتك كما سجّله المعلم." />
      <MyAttendance student={student} lookups={lookups} today={MOCK_TODAY} />
    </>
  )
}

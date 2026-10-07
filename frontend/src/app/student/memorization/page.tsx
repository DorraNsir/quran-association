import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { MyMemorization } from "@/components/student/student-space"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default async function StudentMemorizationPage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return (
    <>
      <PageHeader title="متابعة الحفظ" description="آخر سورة حفظتها في كل سداسي، كما سجّلها المعلم." />
      <MyMemorization student={student} lookups={lookups} today={MOCK_TODAY} />
    </>
  )
}

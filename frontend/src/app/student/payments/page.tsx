import type { Metadata } from "next"

import { MyPayments } from "@/components/payments/student-payments-page"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { academicYears, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "المدفوعات" }

export default async function StudentPaymentsPage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return <MyPayments studentId={student.id} academicYears={academicYears} today={MOCK_TODAY} />
}

import type { Metadata } from "next"

import { MyPayments } from "@/components/payments/student-payments-page"

export const metadata: Metadata = { title: "المدفوعات" }

/** The signed-in student's own fees and payments (GET /api/student/finance/summary, /api/student/payments). */
export default function StudentPaymentsPage() {
  return <MyPayments />
}

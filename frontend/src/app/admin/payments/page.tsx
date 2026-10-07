import type { Metadata } from "next"

import { PaymentsOverview } from "@/components/payments/payments-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "المدفوعات" }

export default async function PaymentsPage() {
  const user = await getCurrentUser()
  return <PaymentsOverview userId={user.id} lookups={lookups} today={MOCK_TODAY} />
}

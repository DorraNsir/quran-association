import type { Metadata } from "next"

import { PaymentsScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "المدفوعات" }

export default function Page() {
  return <PaymentsScreen />
}

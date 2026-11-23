import type { Metadata } from "next"

import { AdminFeedbackScreen } from "@/components/feedback/feedback-views"

export const metadata: Metadata = { title: "إدارة الملاحظات والاقتراحات" }

export default function Page() {
  return <AdminFeedbackScreen />
}

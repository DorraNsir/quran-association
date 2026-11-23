import type { Metadata } from "next"

import { MyFeedbackScreen } from "@/components/feedback/feedback-views"

export const metadata: Metadata = { title: "الملاحظات والاقتراحات" }

export default function Page() {
  return <MyFeedbackScreen space="student" />
}

import type { Metadata } from "next"

import { MyFeedbackDetail } from "@/components/feedback/feedback-views"

export const metadata: Metadata = { title: "ملاحظة" }

export default async function Page(props: PageProps<"/teacher/feedback/[id]">) {
  const { id } = await props.params
  return <MyFeedbackDetail space="teacher" id={id} />
}

import type { Metadata } from "next"

import { AdminFeedbackDetail } from "@/components/feedback/feedback-views"

export const metadata: Metadata = { title: "ملاحظة" }

export default async function Page(props: PageProps<"/admin/feedback/[id]">) {
  const { id } = await props.params
  return <AdminFeedbackDetail id={id} />
}

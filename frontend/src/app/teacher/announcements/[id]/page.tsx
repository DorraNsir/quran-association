import type { Metadata } from "next"

import { TeacherAnnouncementScreen } from "@/components/communication/teacher-announcements"

export const metadata: Metadata = { title: "الإعلان" }

/** Not addressed to this account → the API answers 404 (shown as "not found"). */
export default async function Page(props: PageProps<"/teacher/announcements/[id]">) {
  const { id } = await props.params
  return <TeacherAnnouncementScreen id={id} />
}

import type { Metadata } from "next"

import { AnnouncementDetails } from "@/components/communication/announcements-views"

export const metadata: Metadata = { title: "الإعلان" }

/** Not addressed to this account → the API answers 404 (shown as "not found"). */
export default async function Page(props: PageProps<"/student/announcements/[id]">) {
  const { id } = await props.params
  return <AnnouncementDetails announcementId={id} workspace="student" />
}

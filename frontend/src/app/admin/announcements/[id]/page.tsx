import type { Metadata } from "next"

import { AdminAnnouncementScreen } from "@/components/communication/communication-screens"

export const metadata: Metadata = { title: "الإعلان" }

export default async function AdminAnnouncementPage(props: PageProps<"/admin/announcements/[id]">) {
  const { id } = await props.params
  return <AdminAnnouncementScreen id={id} />
}

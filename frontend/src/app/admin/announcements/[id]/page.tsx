import type { Metadata } from "next"

import { AnnouncementDetails } from "@/components/communication/announcements-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلان" }

export default async function AdminAnnouncementPage(props: PageProps<"/admin/announcements/[id]">) {
  const { id } = await props.params
  const user = await getCurrentUser()
  return <AnnouncementDetails announcementId={id} viewer={{ workspace: "admin", user }} lookups={lookups} today={MOCK_TODAY} />
}

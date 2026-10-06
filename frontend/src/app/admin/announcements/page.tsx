import type { Metadata } from "next"

import { AdminAnnouncements } from "@/components/communication/announcements-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلانات" }

export default async function AdminAnnouncementsPage() {
  const user = await getCurrentUser()
  return <AdminAnnouncements user={user} lookups={lookups} today={MOCK_TODAY} />
}

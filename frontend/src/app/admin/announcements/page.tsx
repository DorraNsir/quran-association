import type { Metadata } from "next"

import { AdminAnnouncementsScreen } from "@/components/communication/communication-screens"

export const metadata: Metadata = { title: "الإعلانات" }

export default function AdminAnnouncementsPage() {
  return <AdminAnnouncementsScreen />
}

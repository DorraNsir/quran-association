import type { Metadata } from "next"

import { NotificationsPage } from "@/components/communication/notifications"
import { getCurrentUser } from "@/lib/auth/current-user"
import { MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإشعارات" }

export default async function AdminNotificationsPage() {
  const user = await getCurrentUser()
  return <NotificationsPage userId={user.id} workspace="admin" today={MOCK_TODAY} />
}

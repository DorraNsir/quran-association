import type { Metadata } from "next"

import { NotificationsPage } from "@/components/communication/notifications"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإشعارات" }

export default async function StudentNotificationsPage() {
  const { user } = await getCurrentStudent()
  return <NotificationsPage userId={user.id} workspace="student" today={MOCK_TODAY} />
}

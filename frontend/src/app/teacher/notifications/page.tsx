import type { Metadata } from "next"

import { NotificationsPage } from "@/components/communication/notifications"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإشعارات" }

export default async function TeacherNotificationsPage() {
  const { user } = await getCurrentTeacher()
  return <NotificationsPage userId={user.id} workspace="teacher" today={MOCK_TODAY} />
}

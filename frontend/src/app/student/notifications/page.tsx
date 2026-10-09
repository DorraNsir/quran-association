import type { Metadata } from "next"

import { NotificationsPage } from "@/components/communication/notifications"

export const metadata: Metadata = { title: "الإشعارات" }

export default function Page() {
  return <NotificationsPage workspace="student" />
}

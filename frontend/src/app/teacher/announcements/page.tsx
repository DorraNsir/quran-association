import type { Metadata } from "next"

import { AnnouncementFeed } from "@/components/communication/announcements-views"

export const metadata: Metadata = { title: "الإعلانات" }

/** The API returns only the announcements addressed to the signed-in account. */
export default function Page() {
  return <AnnouncementFeed workspace="teacher" />
}

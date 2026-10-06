import type { Metadata } from "next"

import { AnnouncementFeed } from "@/components/communication/announcements-views"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلانات" }

export default async function TeacherAnnouncementsPage() {
  const { teacherId } = await getCurrentTeacher()
  return <AnnouncementFeed reader={{ workspace: "teacher", teacherId }} lookups={lookups} today={MOCK_TODAY} />
}

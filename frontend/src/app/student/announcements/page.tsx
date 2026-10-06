import type { Metadata } from "next"

import { AnnouncementFeed } from "@/components/communication/announcements-views"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلانات" }

export default async function StudentAnnouncementsPage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return <AnnouncementFeed reader={{ workspace: "student", student }} lookups={lookups} today={MOCK_TODAY} />
}

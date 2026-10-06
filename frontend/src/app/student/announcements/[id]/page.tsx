import type { Metadata } from "next"

import { AnnouncementDetails } from "@/components/communication/announcements-views"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلان" }

export default async function StudentAnnouncementPage(props: PageProps<"/student/announcements/[id]">) {
  const { id } = await props.params
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return <AnnouncementDetails announcementId={id} viewer={{ workspace: "student", student }} lookups={lookups} today={MOCK_TODAY} />
}

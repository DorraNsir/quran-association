import type { Metadata } from "next"

import { AnnouncementDetails } from "@/components/communication/announcements-views"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "الإعلان" }

export default async function TeacherAnnouncementPage(props: PageProps<"/teacher/announcements/[id]">) {
  const { id } = await props.params
  const { teacherId } = await getCurrentTeacher()
  return <AnnouncementDetails announcementId={id} viewer={{ workspace: "teacher", teacherId }} lookups={lookups} today={MOCK_TODAY} />
}

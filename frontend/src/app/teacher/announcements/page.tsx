import type { Metadata } from "next"

import { TeacherAnnouncementsScreen } from "@/components/communication/teacher-announcements"

export const metadata: Metadata = { title: "الإعلانات" }

/** The feed of what reaches the teacher, and «إعلاناتي»: their own announcements to their current classes. */
export default function Page() {
  return <TeacherAnnouncementsScreen />
}

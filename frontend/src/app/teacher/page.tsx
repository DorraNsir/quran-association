import type { Metadata } from "next"

import { TeacherHomeScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "فضاء المعلم" }

export default function Page() {
  return <TeacherHomeScreen />
}

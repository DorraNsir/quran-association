import type { Metadata } from "next"

import { TeacherScheduleScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "جدولي" }

export default function Page() {
  return <TeacherScheduleScreen />
}

import type { Metadata } from "next"

import { StudentScheduleScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "جدولي" }

export default function Page() {
  return <StudentScheduleScreen />
}

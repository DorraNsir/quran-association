import type { Metadata } from "next"

import { StudentHomeScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "فضاء الطالب" }

export default function Page() {
  return <StudentHomeScreen />
}

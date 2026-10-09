import type { Metadata } from "next"

import { StudentGroupScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "مجموعتي" }

export default function Page() {
  return <StudentGroupScreen />
}

import type { Metadata } from "next"

import { TeacherNotesScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "ملاحظاتي" }

export default function Page() {
  return <TeacherNotesScreen />
}

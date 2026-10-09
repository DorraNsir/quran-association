import type { Metadata } from "next"

import { TeacherClassesScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "مجموعاتي" }

export default function Page() {
  return <TeacherClassesScreen />
}

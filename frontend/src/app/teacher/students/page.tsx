import type { Metadata } from "next"

import { TeacherStudentsScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "طلابي" }

export default function Page() {
  return <TeacherStudentsScreen />
}

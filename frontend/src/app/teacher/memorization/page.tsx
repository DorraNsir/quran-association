import type { Metadata } from "next"

import { TeacherMemorizationScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default function Page() {
  return <TeacherMemorizationScreen />
}

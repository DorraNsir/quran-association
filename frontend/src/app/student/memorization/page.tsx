import type { Metadata } from "next"

import { StudentMemorizationScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default function Page() {
  return <StudentMemorizationScreen />
}

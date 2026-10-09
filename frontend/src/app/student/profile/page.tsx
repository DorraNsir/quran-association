import type { Metadata } from "next"

import { StudentProfileScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "الملف الشخصي" }

export default function Page() {
  return <StudentProfileScreen />
}

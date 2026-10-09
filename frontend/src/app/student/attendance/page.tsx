import type { Metadata } from "next"

import { StudentAttendanceScreen } from "@/components/student/student-screens"

export const metadata: Metadata = { title: "الحضور" }

export default function Page() {
  return <StudentAttendanceScreen />
}

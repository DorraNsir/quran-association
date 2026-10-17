import type { Metadata } from "next"

import { StudentWorkScreen } from "@/components/student/student-work"

export const metadata: Metadata = { title: "متابعة العمل" }

/** The student's own work programs — read-only. */
export default function Page() {
  return <StudentWorkScreen />
}
